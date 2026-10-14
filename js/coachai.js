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
3. 重量・回数(最重要): 次の優先順位で決める。
   a) history に記録がある種目: reference_target(ルールベースの次回目安)を基準にする。大きく外すときは reason に理由を書く。
      - 二重漸進法: 回数帯の上限に全セット到達したら重量アップ、未達なら同重量で回数を増やす。
      - 増量幅: 下半身の大種目(スクワット・デッドリフト・レッグプレス)は2.5〜5kg、上半身バーベルは2.5kg、ダンベルは片手1〜2kg、マシン・単関節は1〜2.5kg。直近トップセットから +5% を超えて上げない。
      - last_rec_results が "missed"(前回の提案に届かなかった)なら重量を上げず、2回連続なら5〜8%下げる。"changed" は本人が別の重量を選んだので、実績を尊重する。
      - 4回以上伸びていない、2週間以上のブランク、前回より明らかに落ちた場合は、約10%軽くして立て直す。
   b) 記録が無い種目: estimated_start(関連種目や体重から算出した初回の目安)を使う。それも無ければ体重・経験から保守的に見積もり、初回は軽め(余力2〜3回)から始めると reason に書く。
   c) 回数帯は目的に合わせる: 筋力=3〜6回、筋肥大=6〜12回、減量/健康維持=10〜15回。初心者は10回前後で余力2〜3回を残す。
   d) セット数: 初心者2〜3、中級者3〜4、上級者3〜5。週あたりの部位別セット数(weekly_sets)が10〜20に収まるように調整し、すでに20を超える部位は種目数を減らす。
   e) 休憩(rest_sec): 大種目の重い(1〜6回)=180〜240秒、大種目(6〜12回)=120〜150秒、単関節=60〜90秒。
   f) 最初の大種目には warmup を付ける(例: "軽重量8回→60%×4回→80%×2回")。2種目目以降は同じ部位なら省略可。
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
            warmup: { type: "string", description: "ウォームアップ(最初の大種目のみ。例: 軽重量8回→60%×4回)" },
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
{"session_title": string, "split_reasoning": string, "exercises": [{"exercise": string, "part": string, "weight_kg": number, "reps": number, "sets": number, "rest_sec": number, "warmup": string, "reason": string}], "notes": string}

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
  // opts.guard(name) → { weight, step }(前回の実績)があれば、それを大きく超える重量は上限に丸める。opts.exclude は今日すでに行った種目
  function clean(raw, knownParts, opts = {}) {
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
      warmup: str(e?.warmup, 80),
      reason: str(e?.reason, 140),
    })).filter((e) => e.exercise && !(opts.exclude && opts.exclude.has(e.exercise)));
    for (const e of exercises) {
      const g = opts.guard && opts.guard(e.exercise);
      if (g && e.weight > g.weight * 1.05 + g.step) {
        e.weight = Math.round((g.weight + g.step) * 2) / 2;
        e.reason = (e.reason + "(前回実績から大きく離れないよう上限を調整)").slice(0, 160);
      }
    }
    if (!exercises.length) throw new Error("提案できる種目がありませんでした。スタイル設定を見直してもう一度お試しください");
    return { title: str(raw.session_title, 60), reasoning: str(raw.split_reasoning, 300), exercises, notes: str(raw.notes, 200) };
  }

  return {
    plan, clean,
    canUse: async () => !!(await sampleFn()) || !!get(KEY_STORE),
  };
})();
