// トレーニングスタイルと記録から、今日のメニュー(種目・重量・回数・セット数)をAIが提案する。
// 呼び出し先は2通り:
//  1) Claudeアーティファクト内 … viewer自身のClaude利用枠(claude.use("sample"))。キー不要
//  2) 通常のブラウザ … Anthropic API を直接呼ぶ。キーは「履歴・設定」で保存したもの(localStorageのみ)
const CoachAI = (() => {
  const KEY_STORE = "kintore-anthropic-key";
  const MODEL_STORE = "kintore-anthropic-model";
  const DEFAULT_MODEL = "claude-sonnet-5-5";
  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };

  const RULES = `あなたは経験豊富なパーソナルトレーナーです。ユーザーのトレーニングスタイル(分割法・週の回数・経験・目的・器具・時間)と直近の記録から、「今日これから行うセッション」の種目と重量・回数・セット数を提案します。

## 決め方
1. 今日のグループ: style.split の分割法に従う。part_days_since(各部位の最終実施からの日数)を見て、最も回復した(空いている)グループを選ぶ。同じ部位は48〜72時間空ける。today_done に記録があれば、そのグループの続きとして未実施の種目を提案し、today_done の種目は繰り返さない。
   - 全身法: 主要部位をバランスよく、1部位1〜2種目。
   - 2分割以上: 担当部位に集中して4〜6種目(minutes が短ければ減らす)。分割法が「おまかせ」なら、頻度と履歴から最適な分け方を選んで理由を述べる。
2. 並び順: 多関節種目(コンパウンド)→単関節種目。
3. 重量・回数: history に記録がある種目は、直近セッションのトップセットと reference_target を基に漸進性過負荷を行う(上限回数に達したら重量アップ[20kg未満は+1kg、以上は+2.5kg]、未達なら同重量で+1回、停滞やブランクがあれば約10%減)。記録が無い種目は body の体重などから保守的に見積もり、初回は軽めから始めると reason に書く。
   回数帯は目的に合わせる: 筋力=3〜6回、筋肥大=6〜12回、減量/健康維持=10〜15回。初心者は控えめに。
4. 器具: style.equipment に無い器具の種目は提案しない(自宅ダンベル=ダンベル種目と自重、自重のみ=自重種目)。
5. style.note の怪我・要望を最優先で尊重する。
6. 重量はkg・0.5kg刻み。自重種目の weight_kg は0。種目名は日本語で、available_exercises にあるものを優先する。part は available_exercises のキー(胸・背中・脚・肩・腕・腹・有酸素・その他)から選ぶ。
7. これは一般的な目安であり、体調やフォームを優先するよう notes に一言添える。医療的な助言はしない。`;

  const SCHEMA = {
    type: "object",
    properties: {
      session_title: { type: "string", description: "今日のセッション名(例: プッシュの日[胸・肩])" },
      split_reasoning: { type: "string", description: "なぜ今日このグループ・この内容にしたか(履歴・回復日数・分割法に触れて2〜3文)" },
      exercises: {
        type: "array",
        items: {
          type: "object",
          properties: {
            exercise: { type: "string" },
            part: { type: "string" },
            weight_kg: { type: "number" },
            reps: { type: "integer" },
            sets: { type: "integer" },
            rest_sec: { type: "integer", description: "セット間の休憩(秒)" },
            reason: { type: "string", description: "この重量・回数にした根拠を1文で" },
          },
          required: ["exercise", "part", "weight_kg", "reps", "sets", "reason"],
        },
      },
      notes: { type: "string", description: "注意点・安全面の一言" },
    },
    required: ["session_title", "split_reasoning", "exercises", "notes"],
  };
  const TOOL = { name: "plan_session", description: "今日のトレーニングメニューを提案する", input_schema: SCHEMA };

  async function sampleFn() {
    try { return window.claude ? await window.claude.use("sample") : null; } catch { return null; }
  }

  async function viaSample(sample, context) {
    const prompt = `${RULES}

## 出力形式
次の形のJSONだけで回答してください(前後に説明文は付けない)。
{"session_title": string, "split_reasoning": string, "exercises": [{"exercise": string, "part": string, "weight_kg": number, "reps": number, "sets": number, "rest_sec": number, "reason": string}], "notes": string}

## ユーザーのデータ(JSON)
${JSON.stringify(context)}`;
    return sample.json(prompt, { cache: false });
  }

  async function viaApi(context) {
    const key = get(KEY_STORE);
    if (!key) throw new Error("AIを使うには「履歴・設定」でAPIキーを設定してください");
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
        max_tokens: 2048,
        system: RULES,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: `次のデータから、今日のメニューを提案してください。\n${JSON.stringify(context)}` }],
      }),
    });
    if (!res.ok) {
      let msg = "";
      try { msg = (await res.json()).error?.message || ""; } catch {}
      if (res.status === 401) throw new Error("APIキーが正しくありません");
      if (res.status === 429) throw new Error("リクエストが多すぎます。少し待ってから再試行してください");
      throw new Error(`提案の作成に失敗しました (${res.status}) ${msg}`);
    }
    const out = (await res.json()).content?.find((b) => b.type === "tool_use")?.input;
    if (!out) throw new Error("AIの回答を読み取れませんでした");
    return out;
  }

  async function plan(context) {
    const sample = await sampleFn();
    if (sample) {
      try { return await viaSample(sample, context); }
      catch (e) {
        if (e && e.code) {
          const m = { not_granted: "Claudeの利用が許可されていません", rate_limited: "利用回数の上限です。しばらくしてから再試行してください", invalid_json: "AIの回答を読み取れませんでした。もう一度お試しください" };
          throw new Error(m[e.code] || `提案の作成に失敗しました (${e.code})`);
        }
        throw e;
      }
    }
    return viaApi(context);
  }

  // AIの回答を検証して、画面に出せる形に整える(数値の範囲・文字数・部位名)
  function clean(raw, knownParts) {
    if (!raw || typeof raw !== "object") throw new Error("AIの回答を読み取れませんでした");
    const str = (v, n) => String(v ?? "").trim().slice(0, n);
    const clamp = (v, lo, hi, step = 1) => Math.min(hi, Math.max(lo, Math.round((Number(v) || 0) / step) * step));
    const exercises = (Array.isArray(raw.exercises) ? raw.exercises : []).slice(0, 8).map((e) => ({
      exercise: str(e?.exercise, 40),
      part: knownParts.includes(e?.part) ? e.part : "その他",
      weight: clamp(e?.weight_kg, 0, 500, 0.5),
      reps: clamp(e?.reps, 1, 50),
      sets: clamp(e?.sets, 1, 10),
      rest: e?.rest_sec ? clamp(e.rest_sec, 0, 600) : 0,
      reason: str(e?.reason, 140),
    })).filter((e) => e.exercise);
    if (!exercises.length) throw new Error("提案できる種目がありませんでした。スタイル設定を見直してもう一度お試しください");
    return { title: str(raw.session_title, 60), reasoning: str(raw.split_reasoning, 300), exercises, notes: str(raw.notes, 200) };
  }

  return {
    plan, clean,
    canUse: async () => !!(await sampleFn()) || !!get(KEY_STORE),
  };
})();
