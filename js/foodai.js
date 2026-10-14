// 食事写真 → 栄養素の自動推定(Claude Vision)。
// ブラウザから Anthropic API を直接呼ぶ。APIキーは localStorage にのみ保存し、JSON書き出しには含めない。
const FoodAI = (() => {
  const KEY_STORE = "kintore-anthropic-key";
  const MODEL_STORE = "kintore-anthropic-model";
  const DEFAULT_MODEL = "claude-sonnet-5-5";
  const MAX_EDGE = 1568; // 長辺をこれ以下に縮小(送信量と精度のバランス)

  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const set = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };

  // 個人キャリブレーション: ユーザーが直した量を覚えて、次回の解析に反映する
  const CORR_STORE = "kintore-food-corrections";
  const loadCorrections = () => { try { return JSON.parse(get(CORR_STORE) || "[]"); } catch { return []; } };
  const recordCorrections = (list) => {
    const cur = loadCorrections().filter((c) => !list.some((l) => l.name === c.name));
    set(CORR_STORE, JSON.stringify([...list, ...cur].slice(0, 30)));
  };
  const buildSystem = () =>
    FoodPrompt.system(BASE_SYSTEM, { foods: typeof FOODS !== "undefined" ? FOODS : [], corrections: loadCorrections() });

  const BASE_SYSTEM = `あなたは管理栄養士かつ食事画像計測の専門家です。送られた食事写真から、料理を細かく特定し、大きさ(量)を可能な限り誤差少なく推定し、栄養素を算出します。

## 手順(必ずこの順に考える)
1. 料理の分解: 写真内の料理・食材・飲み物を1品ずつに分ける(ご飯、主菜、副菜、汁物、調味料、飲み物など)。ソース・ドレッシング・揚げ油・バターなど見えにくい脂質も別途考慮する。
2. 縮尺の基準を探す: 写っている物から実寸を割り出す。優先順位の目安:
   - ユーザー指定の基準物(最優先)
   - 皿・茶碗・丼(標準: 夕食皿24〜27cm、中皿19〜21cm、小皿12〜15cm、飯茶碗の口径11〜12cm、丼の口径14〜16cm)
   - 箸(約21〜23cm)、フォーク・スプーン(約17〜20cm)、缶(350ml缶: 直径6.6cm・高さ12.2cm)、ペットボトル(500ml: 高さ約20.5cm)
   - コンビニ弁当容器、カード(8.56×5.40cm)、手や指
   - 基準が無ければ撮影角度・皿の比率から推定し、confidence を下げる。
3. 体積→重量: 品目ごとに寸法(dims_cm)→体積(volume_ml)→密度(density)→重量(grams)の順に必ず計算過程を出す。厚み・高さも考慮し、写真が斜めでも奥行きを補正する。下の参照表の1人前の重さと照合して現実離れしていないか確認する。
4. 栄養素: 日本食品標準成分表(八訂)の値を基準に、調理法(揚げ・炒め・煮)による吸油・調味料込みで kcal とたんぱく質(p)・脂質(f)・炭水化物(c)をグラム単位で算出する。kcal ≈ 4p + 9f + 4c の整合を確認し、大きくズレる場合は見直す。
5. 不確実性: 隠れた部分(中身、底の具材)は一般的な内容を仮定し、その仮定を notes に書く。

## ルール
- 食事・飲み物が写っていなければ items を空配列にし、notes に理由を書く。
- 推測できない時に数値を盛らない。曖昧な料理は一般的な1人前を基準にし confidence を "low" にする。
- 名称は日本語。量は必ずグラム(飲み物は ml≒g)で出す。
- JSONのキーは出力例の順(計算過程→結果)で書く。
- 必ず record_meal ツールまたは指定のJSON形式で回答する。`;

  const TOOL = {
    name: "record_meal",
    description: "写真から推定した食事内容と栄養素を記録する",
    input_schema: {
      type: "object",
      properties: {
        meal_name: { type: "string", description: "食事全体の短い名前(例: 鶏の唐揚げ定食)" },
        scale_reference: { type: "string", description: "縮尺の根拠にした物と推定した実寸(例: 皿の直径を約26cmと仮定)" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              dims_cm: { type: "string", description: "推定した寸法(cm)。例: 口径12×高さ5.5" },
              volume_ml: { type: "number", description: "推定体積(ml)" },
              density: { type: "number", description: "密度(g/ml)" },
              grams: { type: "number", description: "推定重量(g)。飲み物はml≒g" },
              grams_min: { type: "number", description: "現実的な下限(g)" },
              grams_max: { type: "number", description: "現実的な上限(g)" },
              size_basis: { type: "string", description: "この量にした根拠(寸法・厚み・密度など)を1文で" },
              kcal: { type: "number" },
              p: { type: "number", description: "たんぱく質(g)" },
              f: { type: "number", description: "脂質(g)" },
              c: { type: "number", description: "炭水化物(g)" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["name", "dims_cm", "volume_ml", "density", "size_basis", "grams", "grams_min", "grams_max", "kcal", "p", "f", "c", "confidence"],
          },
        },
        notes: { type: "string", description: "仮定・不確実な点・精度を上げる撮影のコツ" },
      },
      required: ["meal_name", "scale_reference", "items", "notes"],
    },
  };

  // 画像を縮小して JPEG の base64 にする
  async function toBase64(file) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * s);
    cv.height = Math.round(bmp.height * s);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL("image/jpeg", 0.85);
    return { data: url.split(",")[1], url };
  }

  async function analyze(file, { reference = "", note = "" } = {}) {
    const key = get(KEY_STORE);
    if (!key) throw new Error("先に「履歴・設定」タブでAPIキーを設定してください");
    const img = await toBase64(file);
    const hints = [
      reference && `大きさの基準物: ${reference}`,
      note && `ユーザーの補足: ${note}`,
    ].filter(Boolean).join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: get(MODEL_STORE) || DEFAULT_MODEL,
        max_tokens: 4096,
        system: buildSystem(),
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } },
            { type: "text", text: "この食事の内容・量・栄養素を分析してください。" + (hints ? "\n" + hints : "") },
          ],
        }],
      }),
    });
    if (!res.ok) {
      let msg = "";
      try { msg = (await res.json()).error?.message || ""; } catch {}
      if (res.status === 401) throw new Error("APIキーが正しくありません");
      if (res.status === 429) throw new Error("リクエストが多すぎます。少し待ってから再試行してください");
      throw new Error(`解析に失敗しました (${res.status}) ${msg}`);
    }
    const out = (await res.json()).content?.find((b) => b.type === "tool_use")?.input;
    return { ...normalize(out), preview: img.url };
  }

  return {
    hasKey: () => !!get(KEY_STORE),
    getKey: () => get(KEY_STORE),
    setKey: (v) => set(KEY_STORE, v.trim()),
    getModel: () => get(MODEL_STORE) || DEFAULT_MODEL,
    setModel: (v) => set(MODEL_STORE, v.trim() === DEFAULT_MODEL ? "" : v.trim()),
    DEFAULT_MODEL,
    recordCorrections,
    correctionCount: () => loadCorrections().length,
    clearCorrections: () => set(CORR_STORE, ""),
    usesClaudeApp: async () => !!(await getSample()),
    analyze,
  };
})();
