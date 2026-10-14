const $ = (id) => document.getElementById(id);
let db = Store.load();

const today = () => fmtDate(new Date());
const curDate = () => $("date").value || today();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Math.round(n).toLocaleString();
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

function persist() { Store.save(db); render(); }
function remove(kind, id) { db[kind] = db[kind].filter((r) => r.id !== id); persist(); }

const BODY_METRICS = {
  weight: { label: "体重", unit: "kg", get: (b) => b.weight },
  fat: { label: "体脂肪率", unit: "%", get: (b) => b.fat },
  muscle: { label: "筋肉量", unit: "kg", get: (b) => b.muscle },
  bmi: { label: "BMI", unit: "", get: (b, h) => bodyDerived(b, h).bmi },
  fatMass: { label: "体脂肪量", unit: "kg", get: (b, h) => bodyDerived(b, h).fatMass },
  lbm: { label: "除脂肪体重", unit: "kg", get: (b, h) => bodyDerived(b, h).lbm },
};
const MEAL_BADGE = { 朝食: "朝", 昼食: "昼", 夕食: "夕", 間食: "間", プロテイン: "P", サプリ: "サ" };

// ---- 初期化 ----
$("date").value = today();
$("date").addEventListener("change", render);
$("prev-day").addEventListener("click", () => { $("date").value = shiftDate(curDate(), -1); render(); });
$("next-day").addEventListener("click", () => { $("date").value = shiftDate(curDate(), 1); render(); });
window.addEventListener("resize", render);

// 種目の候補: プリセット + 自分で登録した種目 + 記録済みの種目(部位ごと)
function catalog() {
  const c = {};
  const put = (part, name) => { (c[part] ||= []); if (!c[part].includes(name)) c[part].push(name); };
  Object.entries(EXERCISES).forEach(([p, list]) => list.forEach((e) => put(p, e)));
  Object.keys(EXERCISES).forEach((p) => (c[p] ||= []));
  (db.customExercises || []).forEach((e) => put(e.part, e.name));
  db.workouts.forEach((w) => put(w.part, w.exercise));
  return c;
}
for (const part of Object.keys(EXERCISES)) { $("w-part").add(new Option(part, part)); $("ex-part").add(new Option(part, part)); }
function fillExerciseList() {
  $("exercise-list").innerHTML = (catalog()[$("w-part").value] || []).map((e) => `<option value="${esc(e)}">`).join("");
}
$("w-part").addEventListener("change", fillExerciseList);
fillExerciseList();

$("ex-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("ex-name").value.trim(), part = $("ex-part").value;
  if (!name) return;
  if (!(catalog()[part] || []).includes(name)) (db.customExercises ||= []).push({ id: Store.newId(), part, name });
  $("ex-name").value = "";
  persist();
});

// おすすめの「入力」ボタン: 種目・重量・回数・セット数を入力欄にセットする
document.addEventListener("click", (e) => {
  const b = e.target.closest(".use");
  if (!b) return;
  if (b.dataset.w) { // 提案を採用した記録。次回、実績と比べて提案を調整する
    db.recLog = (db.recLog || []).filter((r) => !(r.date === curDate() && r.exercise === b.dataset.ex))
      .concat({ date: curDate(), exercise: b.dataset.ex, weight: +b.dataset.w, reps: +b.dataset.r }).slice(-120);
    Store.save(db);
  }
  $("w-part").value = b.dataset.part;
  fillExerciseList();
  $("w-exercise").value = b.dataset.ex;
  $("w-weight").value = b.dataset.w || "";
  $("w-reps").value = b.dataset.r || "";
  $("w-sets").value = b.dataset.s || 1;
  updateRmPreview();
  $("workout-form").scrollIntoView({ behavior: "smooth", block: "center" });
});

// 自分で登録した食品・サプリ(先頭に並べる)とプリセット
const MEAL_TYPES = ["朝食", "昼食", "夕食", "間食", "プロテイン", "サプリ"];
const customOf = (kind) => (db.customFoods || []).filter((c) => c.kind === kind);
const foodItems = () => [...customOf("food").map((c) => [c.name, c.kcal, c.p, c.f, c.c]), ...FOODS];
const suppItems = () => [...customOf("supp").map((c) => [c.name, c.dose || "", c.kcal, c.p, c.f, c.c]), ...SUPPLEMENTS];

function fillMealTypes() {
  const sel = $("m-type"), cur = sel.value;
  const names = [...MEAL_TYPES, ...(db.customMealTypes || []).map((t) => t.name)];
  sel.innerHTML = names.map((n) => `<option>${esc(n)}</option>`).join("");
  if (names.includes(cur)) sel.value = cur;
}

// 区分が「サプリ」のときは候補をサプリにし、用量欄を出す
function fillFoodList() {
  const supp = $("m-type").value === "サプリ";
  $("food-list").innerHTML = (supp ? suppItems() : foodItems()).map((f) => `<option value="${esc(f[0])}">`).join("");
  $("dose-field").hidden = !supp;
}
$("m-type").addEventListener("change", fillFoodList);
fillMealTypes();
fillFoodList();

// 食品・サプリの登録
$("cf-kind").addEventListener("change", () => { $("cf-dose-field").hidden = $("cf-kind").value !== "supp"; });
$("cf-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const kind = $("cf-kind").value, name = $("cf-name").value.trim();
  const exists = (kind === "supp" ? suppItems() : foodItems()).some((x) => x[0] === name);
  if (!name || exists) { $("cf-notice").textContent = exists ? `「${name}」は登録済みです` : ""; return; }
  const n = (id) => +$(id).value || 0;
  (db.customFoods ||= []).push({
    id: Store.newId(), kind, name, dose: kind === "supp" ? $("cf-dose").value.trim() : "",
    kcal: n("cf-kcal"), p: n("cf-p"), f: n("cf-f"), c: n("cf-c"),
  });
  e.target.reset();
  $("cf-dose-field").hidden = true;
  $("cf-notice").textContent = `「${name}」を登録しました。${kind === "supp" ? "サプリのボタンと候補" : "食品の候補"}に出ます`;
  persist();
});

// 食事の区分の追加
$("ct-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("ct-name").value.trim();
  const exists = [...MEAL_TYPES, ...(db.customMealTypes || []).map((t) => t.name)].includes(name);
  if (!name || exists) { $("ct-notice").textContent = exists ? `「${name}」は既にあります` : ""; return; }
  (db.customMealTypes ||= []).push({ id: Store.newId(), name });
  e.target.reset();
  $("ct-notice").textContent = `区分「${name}」を追加しました`;
  persist();
});
$("m-name").addEventListener("input", () => {
  const supp = $("m-type").value === "サプリ";
  const f = (supp ? suppItems() : foodItems()).find((x) => x[0] === $("m-name").value);
  if (!f) return;
  if (supp) { $("m-dose").value = f[1]; [$("m-kcal").value, $("m-p").value, $("m-f").value, $("m-c").value] = f.slice(2); }
  else { $("m-kcal").value = f[1]; $("m-p").value = f[2]; $("m-f").value = f[3]; $("m-c").value = f[4]; }
});

for (const [k, m] of Object.entries(BODY_METRICS)) $("body-metric").add(new Option(m.label, k));
$("body-metric").addEventListener("change", render);
$("an-exercise").addEventListener("change", render);

document.querySelectorAll("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== "tab-" + b.dataset.tab));
    window.scrollTo(0, 0);
    render();
  })
);

// ---- トレーニングスタイル(設定) ----
const style = () => db.profile.style || {};
const split = () => SPLITS[style().split] || SPLITS.auto;
const fillSelect = (id, entries) => entries.forEach(([v, label]) => $(id).add(new Option(label, v)));
fillSelect("s-split", Object.entries(SPLITS).map(([k, v]) => [k, v.label]));
fillSelect("s-days", [1, 2, 3, 4, 5, 6, 7].map((n) => [n, `週${n}回`]));
fillSelect("s-level", Object.entries(LEVELS));
fillSelect("s-goal", Object.entries(GOALS));
fillSelect("s-equip", Object.entries(EQUIPMENT));
$("s-days").value = 3;

$("style-form").addEventListener("submit", (e) => {
  e.preventDefault();
  db.profile.style = {
    split: $("s-split").value, days: +$("s-days").value, level: $("s-level").value, goal: $("s-goal").value,
    equip: $("s-equip").value, minutes: +$("s-minutes").value || 0, note: $("s-note").value.trim(),
  };
  delete db.aiRec; // スタイルが変わったので、前回のAI提案は破棄
  persist();
});

// おすすめの調整に使う付帯情報(体重・経験・過去の提案結果)
function tuneCtx() {
  const b = [...db.body].sort((x, y) => y.date.localeCompare(x.date))[0];
  return { bw: b ? b.weight : null, level: style().level, outcomesOf: (ex) => recOutcomes(db.workouts, db.recLog || [], ex) };
}
const tuneOpts = (ctx, ex) => ({ bw: ctx.bw, level: ctx.level, outcomes: ctx.outcomesOf(ex) });

// AIに渡す材料: スタイル・今日の記録・各部位の空き日数・種目ごとの直近の記録と、ルールベースの参考値
function coachContext(d) {
  const st = style(), sp = split(), cat = catalog(), tc = tuneCtx();
  const since = {};
  Object.keys(cat).forEach((p) => {
    const last = db.workouts.filter((w) => w.part === p && w.date <= d).reduce((m, w) => (w.date > m ? w.date : m), "");
    since[p] = last ? daysBetween(last, d) : null; // null = 記録なし
  });
  const from = shiftDate(d, -90);
  const names = [...new Set(db.workouts.filter((w) => w.date >= from && w.date <= d && w.weight > 0).map((w) => w.exercise))];
  const history = names.map((n) => {
    const ss = sessionsOf(db.workouts, n, d).slice(-3);
    const top = (s) => s.rows.reduce((a, b) => (est1RM(b.weight, b.reps) > est1RM(a.weight, a.reps) ? b : a));
    const t = nextTarget(db.workouts, n, d, st.goal, tuneOpts(tc, n));
    return {
      last_rec_results: tc.outcomesOf(n),
      exercise: n, part: ss[ss.length - 1].rows[0].part, last_date: ss[ss.length - 1].date,
      recent_sessions: ss.map((s) => ({ date: s.date, top_set: `${top(s).weight}kg×${top(s).reps}回`, sets: sum(s.rows, (r) => r.sets) })),
      reference_target: t ? { weight_kg: t.weight, reps: t.reps, sets: t.sets } : null,
    };
  }).sort((a, b) => b.last_date.localeCompare(a.last_date)).slice(0, 30);
  const b = [...db.body].sort((x, y) => y.date.localeCompare(x.date))[0];
  return {
    today: d, weekday: DOW[parseDate(d).getDay()],
    style: {
      split: sp.label, split_groups: sp.groups ? sp.groups.map((g) => `${g.name}(${g.parts.join("・")})`) : "未指定(おまかせ)",
      days_per_week: st.days || null, level: LEVELS[st.level] || "未設定", goal: GOALS[st.goal] || "未設定",
      equipment: EQUIPMENT[st.equip] || "ジム", minutes: st.minutes || null, note: st.note || "",
    },
    body: b ? { weight_kg: b.weight, body_fat_percent: b.fat, height_cm: db.profile.height || null } : { height_cm: db.profile.height || null },
    today_done: db.workouts.filter((w) => w.date === d).map((w) => ({ exercise: w.exercise, part: w.part, weight_kg: w.weight, reps: w.reps, sets: w.sets })),
    part_days_since: since,
    history,
    weekly_sets: Object.fromEntries(Object.keys(cat).map((p) => [p, sum(inRange(db.workouts, shiftDate(d, -6), d).filter((w) => w.part === p), (w) => w.sets)]).filter(([, n]) => n)),
    estimated_start: Object.fromEntries(Object.values(cat).flat().filter((n) => !names.includes(n))
      .map((n) => [n, estimateStart(db.workouts, n, d, st.goal, tc)]).filter(([, t]) => t)
      .map(([n, t]) => [n, { weight_kg: t.weight, reps: t.reps, basis: t.reason }])),
    available_exercises: Object.fromEntries(Object.entries(cat).filter(([, l]) => l.length)),
  };
}

let aiBusy = false;
$("ai-rec").addEventListener("click", async () => {
  if (aiBusy) return;
  aiBusy = true;
  const btn = $("ai-rec"), d = curDate();
  btn.disabled = true;
  btn.textContent = "AIが考えています…(最大1分ほど)";
  try {
    const raw = await CoachAI.plan(coachContext(d));
    db.aiRec = { date: d, result: CoachAI.clean(raw, Object.keys(catalog()), {
      exclude: new Set(db.workouts.filter((w) => w.date === d).map((w) => w.exercise)),
      guard: (n) => {
        const ss = sessionsOf(db.workouts, n, d);
        if (!ss.length) return null;
        const t = ss[ss.length - 1].rows.reduce((a, c) => (c.weight > a.weight ? c : a));
        return { weight: t.weight, step: weightStep(t.weight, n) };
      },
    }) };
    Store.save(db);
    renderRecommend(d);
  } catch (e) {
    $("ai-rec-out").innerHTML = `<p class="hint">${esc(e.message || "提案の作成に失敗しました")}</p>`;
    btn.textContent = "✨ AIで今日のメニューを作る";
  } finally {
    aiBusy = false;
    btn.disabled = false;
  }
});

// 「設定する」などのリンクボタンからタブを切り替える
document.addEventListener("click", (e) => {
  const sp = e.target.closest("[data-supp]");
  if (sp) {
    const s = suppList()[+sp.dataset.supp];
    if (s) { db.meals.push({ id: Store.newId(), date: curDate(), type: "サプリ", name: s.name, dose: s.dose, kcal: s.kcal, p: s.p, f: s.f, c: s.c }); persist(); }
    return;
  }
  const r = e.target.closest("[data-recent]");
  if (r) {
    const m = db.meals.find((x) => x.id === r.dataset.recent);
    if (m) { $("m-name").value = m.name; $("m-kcal").value = m.kcal; $("m-p").value = m.p; $("m-f").value = m.f; $("m-c").value = m.c; $("m-type").value = m.type; fillFoodList(); $("m-dose").value = m.dose || ""; }
    return;
  }
  const g = e.target.closest("[data-goto]");
  if (g) document.querySelector(`nav button[data-tab="${g.dataset.goto}"]`).click();
});

// ---- フォーム ----
function updateRmPreview() {
  const w = +$("w-weight").value, r = +$("w-reps").value;
  $("rm-preview").textContent = w > 0 && r > 0 ? `推定1RM ${round(est1RM(w, r))}kg` : "推定1RM —";
}
$("w-weight").addEventListener("input", updateRmPreview);
$("w-reps").addEventListener("input", updateRmPreview);

$("workout-form").addEventListener("submit", (e) => {
  e.preventDefault();
  db.workouts.push({
    id: Store.newId(), date: curDate(), part: $("w-part").value, exercise: $("w-exercise").value.trim(),
    weight: +$("w-weight").value, reps: +$("w-reps").value, sets: +$("w-sets").value,
  });
  $("w-exercise").value = "";
  updateRmPreview();
  persist();
});

$("meal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  db.meals.push({
    id: Store.newId(), date: curDate(), type: $("m-type").value, name: $("m-name").value.trim(),
    kcal: +$("m-kcal").value, p: +$("m-p").value || 0, f: +$("m-f").value || 0, c: +$("m-c").value || 0,
    ...($("m-type").value === "サプリ" && $("m-dose").value.trim() ? { dose: $("m-dose").value.trim() } : {}),
  });
  e.target.reset();
  fillFoodList();
  persist();
});

$("body-form").addEventListener("submit", (e) => {
  e.preventDefault();
  db.body = db.body.filter((b) => b.date !== curDate()); // 1日1件
  db.body.push({
    id: Store.newId(), date: curDate(), weight: +$("b-weight").value,
    fat: +$("b-fat").value || null, muscle: +$("b-muscle").value || null,
  });
  e.target.reset();
  persist();
});

$("b-height").addEventListener("change", () => {
  db.profile.height = +$("b-height").value || null;
  persist();
});

$("goal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  db.goal = { kcal: +$("g-kcal").value || 0, p: +$("g-p").value || 0 };
  persist();
});

function renderRmCalc() {
  const w = +$("rm-weight").value, r = +$("rm-reps").value;
  if (!(w > 0 && r > 0)) { $("rm-result").innerHTML = '<p class="hint">重量と回数を入力すると、推定1RMと各回数の目安重量を表示します</p>'; return; }
  const rm = est1RM(w, r);
  const rows = Array.from({ length: 12 }, (_, i) => i + 1).map((n) =>
    `<tr><td>${n}RM</td><td>${round(weightAtReps(rm, n))} kg</td><td>${Math.round((weightAtReps(rm, n) / rm) * 100)}%</td></tr>`).join("");
  $("rm-result").innerHTML = `<div class="cards"><div class="card dark hint-card"><span>推定1RM</span><b>${round(rm)}<small> kg</small></b></div></div><table><tr><th>回数</th><th>重量</th><th>%1RM</th></tr>${rows}</table>`;
}
$("rm-form").addEventListener("input", renderRmCalc);

// ---- 写真から食事を自動計算(AI) ----
let aiMeal = null; // { items: [{...,base}], ... } グラム修正時は base から比例計算する
const CONF = { high: "確度 高", medium: "確度 中", low: "確度 低" };

function aiTotals() {
  return { kcal: sum(aiMeal.items, (i) => i.kcal), p: sum(aiMeal.items, (i) => i.p), f: sum(aiMeal.items, (i) => i.f), c: sum(aiMeal.items, (i) => i.c) };
}
function renderAi(msg) {
  const el = $("ai-result");
  if (msg) { el.innerHTML = `<p class="hint">${esc(msg)}</p>`; return; }
  if (!aiMeal) { el.innerHTML = ""; return; }
  const t = aiTotals();
  el.innerHTML = `
    <img class="ai-photo" src="${aiMeal.preview}" alt="解析した写真">
    <p class="summary">${esc(aiMeal.meal_name || "食事")}<br>${round(t.kcal)}kcal ／ P ${round(t.p)}g F ${round(t.f)}g C ${round(t.c)}g</p>
    <ul class="list">${aiMeal.items.map((i, n) => `
      <li class="item"><div class="body"><input data-ai-name="${n}" value="${esc(i.name)}" aria-label="料理名" maxlength="60">${chips([i.grams_min ? `${round(i.grams_min, 0)}〜${round(i.grams_max, 0)}g` : "", `${round(i.kcal)}kcal`, `P ${round(i.p)}g`, `F ${round(i.f)}g`, `C ${round(i.c)}g`, CONF[i.confidence]])}
        <p class="hint">${esc(i.size_basis || "")}</p>
        <label class="f">量 (g)<input type="number" inputmode="decimal" min="0" step="1" value="${round(i.grams)}" data-ai-grams="${n}"></label></div>
        <button class="del" data-ai-del="${n}" aria-label="除外">✕</button></li>`).join("")}</ul>
    <p class="hint">📏 ${esc(aiMeal.scale_reference || "")}</p>
    ${aiMeal.notes ? `<p class="hint">${esc(aiMeal.notes)}</p>` : ""}
    <button type="button" id="ai-add" class="block add-ai" ${aiMeal.items.length ? "" : "disabled"}>${esc($("m-type").value)}としてこの日に追加</button>`;
}

$("ai-photo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  aiMeal = null;
  renderAi($("ai-precise").checked ? "高精度モードで解析中…(最大1分ほどかかります)" : "解析中…(10〜20秒ほどかかります)");
  try {
    const r = await FoodAI.analyze(file, { reference: $("ai-ref").value, note: $("ai-note").value.trim(), precise: $("ai-precise").checked });
    aiMeal = { ...r, items: r.items.map((i) => ({ ...i, base: { ...i } })) };
    if (aiMeal.items.length) renderAi();
    else renderAi(r.notes || "食事が見つかりませんでした");
  } catch (err) {
    renderAi(err.message);
  }
});

$("ai-result").addEventListener("change", (e) => {
  const nm = e.target.dataset.aiName;
  if (nm != null) { aiMeal.items[nm].name = e.target.value.trim() || aiMeal.items[nm].name; renderAi(); return; }
  const n = e.target.dataset.aiGrams;
  if (n == null) return;
  const i = aiMeal.items[n], b = i.base, g = Math.max(0, +e.target.value || 0);
  const k = b.grams > 0 ? g / b.grams : 0;
  Object.assign(i, { grams: g, kcal: b.kcal * k, p: b.p * k, f: b.f * k, c: b.c * k, grams_min: null, grams_max: null });
  renderAi();
});
$("ai-result").addEventListener("click", (e) => {
  const d = e.target.closest("[data-ai-del]");
  if (d) { aiMeal.items.splice(+d.dataset.aiDel, 1); renderAi(); return; }
  if (e.target.id === "ai-add") {
    FoodAI.recordCorrections(aiMeal.items.filter((i) => i.base.grams > 0 && i.grams > 0 && Math.abs(i.grams - i.base.grams) / i.base.grams >= 0.05)
      .map((i) => ({ name: i.name, ai: Math.round(i.base.grams), actual: Math.round(i.grams) })));
    FoodAI.recordLearned(aiMeal.items);
    for (const i of aiMeal.items) {
      db.meals.push({ id: Store.newId(), date: curDate(), type: $("m-type").value, name: i.name, kcal: round(i.kcal), p: round(i.p), f: round(i.f), c: round(i.c) });
    }
    aiMeal = null;
    renderAi();
    showLearn();
    persist();
  }
});

$("ai-form").addEventListener("submit", (e) => {
  e.preventDefault();
  FoodAI.setKey($("ai-key").value);
  FoodAI.setModel($("ai-model").value || FoodAI.DEFAULT_MODEL);
  $("ai-notice").textContent = "保存しました";
});
const showLearn = () => { $("ai-learn-count").textContent = `覚えた補正: ${FoodAI.correctionCount()}件 ／ 覚えた料理: ${FoodAI.learnedCount()}件`; };
$("ai-learn-clear").addEventListener("click", () => { FoodAI.clearCorrections(); FoodAI.clearLearned(); showLearn(); });
showLearn();
FoodAI.usesClaudeApp().then((ok) => { if (ok) $("ai-settings").hidden = true; }); // サブスク(アーティファクト)ではキー設定不要
$("ai-key").value = FoodAI.getKey();
$("ai-model").value = FoodAI.getModel();

// ---- データ入出力 ----
$("export").addEventListener("click", () => {
  saveFile(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }), `kintore-${today()}.json`);
});
$("import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.workouts) || !Array.isArray(data.meals)) throw new Error();
    db = Object.assign(emptyDb(), data);
    persist();
  } catch {
    $("data-notice").textContent = "読み込めないファイルです";
  }
  e.target.value = "";
});

let demoArmed = false;
$("load-demo").addEventListener("click", () => {
  // アーティファクト内では confirm() が使えないため、2回押しで確定する
  if (!demoArmed) {
    demoArmed = true;
    $("load-demo").textContent = "もう一度押すと現在のデータが置き換わります";
    setTimeout(() => { demoArmed = false; $("load-demo").textContent = "デモデータを読み込む"; }, 5000);
    return;
  }
  demoArmed = false;
  $("load-demo").textContent = "デモデータを読み込む";
  db = buildDemoData();
  persist();
});

// ---- 画像保存 ----
$("save-image").addEventListener("click", () => {
  const d = curDate();
  const ws = db.workouts.filter((w) => w.date === d);
  const ms = db.meals.filter((m) => m.date === d);
  const body = db.body.find((b) => b.date === d);
  const [ws0, we0] = weekRange(d);
  const rows = [
    { t: `${d}  トレーニング記録`, s: 28, b: true, h: 52 },
    { t: `本日 ${num(totalVolume(ws))}kg ／ 今週 ${num(totalVolume(inRange(db.workouts, ws0, we0)))}kg ／ 今月 ${num(totalVolume(db.workouts.filter((w) => w.date.slice(0, 7) === d.slice(0, 7))))}kg`, s: 16, c: "#787774", h: 30 },
    { line: true, h: 24 },
  ];
  if (!ws.length) rows.push({ t: "トレーニング記録なし", c: "#9b9a97" });
  const groups = {};
  ws.forEach((w) => (groups[w.exercise] ||= []).push(w));
  for (const [name, list] of Object.entries(groups)) {
    rows.push({ t: `${name}  (${list[0].part})`, s: 19, b: true, h: 36 });
    list.forEach((w) => rows.push({
      t: `   ${w.weight}kg × ${w.reps}回 × ${w.sets}セット　推定1RM ${round(est1RM(w.weight, w.reps))}kg　負荷量 ${num(volume(w))}kg`,
    }));
  }
  if (ms.length) {
    rows.push({ line: true, h: 24 });
    rows.push({ t: `食事  ${round(sum(ms, (m) => m.kcal))}kcal ／ P ${round(sum(ms, (m) => m.p))}g F ${round(sum(ms, (m) => m.f))}g C ${round(sum(ms, (m) => m.c))}g`, s: 17, b: true, h: 36 });
  }
  if (body) {
    const x = bodyDerived(body, db.profile.height);
    const parts = [`体重 ${body.weight}kg`, body.fat && `体脂肪 ${body.fat}%`, body.muscle && `筋肉量 ${body.muscle}kg`, x.bmi && `BMI ${round(x.bmi)}`].filter(Boolean);
    rows.push({ t: parts.join("　"), s: 16, h: 36 });
  }
  renderRowsToImage(rows, `kintore-${d}.png`);
});

// ---- 描画 ----
const delBtn = (kind, id) => `<button class="del" data-kind="${kind}" data-id="${id}" aria-label="削除">✕</button>`;
const card = (label, value, unit = "", cls = "") => `<div class="card ${cls}"><span>${label}</span><b>${value}</b><small>${unit}</small></div>`;
const chips = (arr) => `<div class="chips">${arr.filter(Boolean).map((c) => `<i>${c}</i>`).join("")}</div>`;
const empty = (t) => `<li class="empty">${t}</li>`;
const delta = (cur, prev) => (prev == null || cur == null ? "" : cur === prev ? "±0" : (cur > prev ? "▲" : "▼") + round(Math.abs(cur - prev)));
document.addEventListener("click", (e) => {
  const b = e.target.closest(".del");
  if (b) remove(b.dataset.kind, b.dataset.id);
});

const RENDERERS = { workout: renderWorkout, meal: renderMeals, body: renderBody, analysis: renderAnalysis, stats: renderStats };
// グラフはサイズが必要なので、表示中のタブだけ描画する
function render() {
  RENDERERS[document.querySelector("nav button.active").dataset.tab](curDate());
}

function recItem(r, withUse) {
  const t = r.target;
  const plan = t ? `${t.weight > 0 ? t.weight + "kg" : "自重"} × ${t.reps}回 × ${t.sets}set` : "初回は軽めの重量から";
  const btn = withUse
    ? `<button type="button" class="use" data-ex="${esc(r.exercise)}" data-part="${esc(r.part)}" data-w="${t ? t.weight : ""}" data-r="${t ? t.reps : ""}" data-s="${t ? t.sets : 3}">入力</button>`
    : "";
  return `<li class="item"><div class="badge">${esc(r.part)}</div><div class="body"><b>${esc(r.exercise)}</b>${chips([plan, r.rest && `休憩 ${r.rest}秒`, r.warmup && `W-up ${r.warmup}`])}<span class="reason">${esc(t ? t.reason : r.reason)}</span>${t && withUse ? `<span class="reason">${esc(r.reason)}</span>` : ""}</div>${btn}</li>`;
}

function renderRecommend(d) {
  const cat = catalog();
  const st = style(), sp = split(), tg = todayGroup(sp, db.workouts, d);
  $("rec-plan").innerHTML = !db.profile.style
    ? '<small>トレーニングスタイル未設定</small> <button type="button" class="linkbtn" data-goto="stats">設定する</button><br><small>設定すると、分割法・目的に合わせた提案になります</small>'
    : tg
      ? `${esc(sp.label)}:今日は「${esc(tg.group.name)}」の日 <small>(${tg.group.parts.join("・")}${tg.continuing ? " / 続き" : ""})</small>`
      : `${esc(sp.label)} <small>・ AIが今日の部位を提案します</small>`;

  const ai = db.aiRec && db.aiRec.date === d ? db.aiRec.result : null;
  $("ai-rec").textContent = ai ? "✨ AIでメニューを作り直す" : "✨ AIで今日のメニューを作る";
  $("ai-rec-out").innerHTML = ai
    ? `<div class="ai-box"><h4>✨ ${esc(ai.title || "今日のメニュー")}</h4><p>${esc(ai.reasoning)}</p><ul class="list">${ai.exercises.map((e) =>
        recItem({ exercise: e.exercise, part: e.part, rest: e.rest, warmup: e.warmup, reason: "", target: { weight: e.weight, reps: e.reps, sets: e.sets, reason: e.reason } }, true)).join("")}</ul>${ai.notes ? `<p class="note">${esc(ai.notes)}</p>` : ""}</div>`
    : "";

  const next = recommendNext(db.workouts, d, cat, sp, st.goal, tuneCtx());
  $("rec-next").innerHTML = next.length ? next.map((r) => recItem(r, true)).join("") : empty("記録が増えると、次の種目を提案します");

  const names = [...new Set(db.workouts.filter((w) => w.date === d && w.weight > 0).map((w) => w.exercise))];
  const partOf = Object.fromEntries(db.workouts.map((w) => [w.exercise, w.part]));
  const targets = names.map((n) => ({ exercise: n, part: partOf[n], target: nextTarget(db.workouts, n, d, st.goal, tuneOpts(tuneCtx(), n)) })).filter((r) => r.target);
  $("rec-target").innerHTML = targets.length ? targets.map((r) => recItem(r, false)).join("") : empty("今日の種目を記録すると、次回の重量・回数を提案します");

  $("ex-list").innerHTML = (db.customExercises || []).length
    ? db.customExercises.map((e) => `<li class="item"><div class="badge light">${esc(e.part)}</div><div class="body"><b>${esc(e.name)}</b></div>${delBtn("customExercises", e.id)}</li>`).join("")
    : empty("登録した種目はまだありません");
  fillExerciseList();
}

function renderWorkout(d) {
  const ws = db.workouts.filter((w) => w.date === d);
  const [from, to] = weekRange(d);
  $("volume-cards").innerHTML =
    card("1日の負荷量", num(totalVolume(ws)), "kg", "dark") +
    card("今週", num(totalVolume(inRange(db.workouts, from, to))), "kg") +
    card("今月", num(totalVolume(db.workouts.filter((w) => w.date.slice(0, 7) === d.slice(0, 7)))), "kg") +
    card("通算", num(totalVolume(db.workouts)), "kg");

  const days = Array.from({ length: 7 }, (_, i) => shiftDate(from, i));
  drawBars($("week-chart"), days.map((dt) => ({ label: DOW[parseDate(dt).getDay()], v: totalVolume(db.workouts.filter((w) => w.date === dt)) })), { highlight: days.indexOf(d) });
  renderRecommend(d);

  $("workout-list").innerHTML = ws.length ? ws.map((w) =>
    `<li class="item"><div class="badge">${esc(w.part)}</div><div class="body"><b>${esc(w.exercise)}</b>${chips([
      `${w.weight}kg × ${w.reps}回 × ${w.sets}set`, `1RM ${round(est1RM(w.weight, w.reps))}kg`, `負荷量 ${num(volume(w))}kg`])}</div>${delBtn("workouts", w.id)}</li>`).join("")
    : empty("この日のトレーニング記録はありません");
  $("workout-summary").hidden = !ws.length;
  $("workout-summary").textContent = `この日の総負荷量: ${num(totalVolume(ws))} kg(${ws.length}件)`;
}

// 記録したことのあるサプリ(初めて記録した順。タップしても並びが動かない)+ プリセットで8件まで
function suppList() {
  const last = {}, cnt = {};
  db.meals.filter((m) => m.type === "サプリ").forEach((m) => { last[m.name] = m; cnt[m.name] = 1; });
  const out = Object.keys(cnt).map((n) => ({ name: n, dose: last[n].dose || "", kcal: last[n].kcal, p: last[n].p, f: last[n].f, c: last[n].c }));
  suppItems().forEach(([name, dose, kcal, p, f, c]) => { if (out.length < 8 && !out.some((o) => o.name === name)) out.push({ name, dose, kcal, p, f, c }); });
  return out.slice(0, 12);
}

// 登録した食品・サプリ・区分の管理画面
function renderCustom() {
  const delRow = (kind, id, badge, title, sub) =>
    `<li class="item"><div class="badge light">${esc(badge)}</div><div class="body"><b>${esc(title)}</b>${sub}</div>${delBtn(kind, id)}</li>`;
  const cf = db.customFoods || [];
  $("cf-list").innerHTML = cf.length ? cf.map((c) => delRow("customFoods", c.id, c.kind === "supp" ? "サ" : "食", c.name,
    chips([c.kind === "supp" && c.dose && esc(c.dose), c.kcal > 0 && `${c.kcal}kcal`, (c.p || c.f || c.c) && `P ${c.p}g F ${c.f}g C ${c.c}g`]))).join("")
    : empty("登録した食品・サプリはまだありません");
  const ct = db.customMealTypes || [];
  $("ct-list").innerHTML = ct.length ? ct.map((t) => delRow("customMealTypes", t.id, [...t.name][0], t.name, "")).join("") : empty("追加した区分はまだありません");
  fillMealTypes();
  fillFoodList();
}

function renderSupplements(d) {
  const today = db.meals.filter((m) => m.date === d && m.type === "サプリ");
  $("supp-chips").innerHTML = suppList().map((s, i) => {
    const n = today.filter((m) => m.name === s.name).length;
    return `<button type="button" data-supp="${i}" class="${n ? "on" : ""}">${n ? "✓ " : ""}${esc(s.name)}${n > 1 ? ` ×${n}` : ""}<small>${esc(s.dose)}</small></button>`;
  }).join("");
  const days = {};
  db.meals.filter((m) => m.type === "サプリ" && m.date.slice(0, 7) === d.slice(0, 7)).forEach((m) => (days[m.name] ||= new Set()).add(m.date));
  const top = Object.entries(days).sort((a, b) => b[1].size - a[1].size).slice(0, 5);
  $("supp-month").textContent = top.length ? "今月の摂取日数: " + top.map(([n, s]) => `${n} ${s.size}日`).join(" / ") : "サプリを記録すると、今月の摂取日数が表示されます";
}

function renderMeals(d) {
  const ms = db.meals.filter((m) => m.date === d);
  const kcal = sum(ms, (m) => m.kcal), P = sum(ms, (m) => m.p), F = sum(ms, (m) => m.f), C = sum(ms, (m) => m.c);
  const goal = db.goal.kcal;
  drawRing($("meal-ring"), goal ? kcal / goal : 0, num(kcal), goal ? `/ ${num(goal)} kcal` : "kcal");

  const energy = P * 4 + F * 9 + C * 4;
  const macro = (name, g, e, extra = "") =>
    `<div class="macro"><b>${name}</b><div class="bar"><div style="width:${energy ? (e / energy) * 100 : 0}%"></div></div><span>${round(g)}g${extra}</span></div>`;
  $("macro-list").innerHTML =
    macro("P", P, P * 4, db.goal.p ? `<em> /${db.goal.p}</em>` : "") + macro("F", F, F * 9) + macro("C", C, C * 4) +
    `<span class="hint">バーはカロリー比率</span>`;

  // 最近の食事: タップでフォームに入力(同じ物をよく食べる人向け)
  const seen = new Set(), recent = [];
  for (const m of [...db.meals].reverse()) { if (!seen.has(m.name)) { seen.add(m.name); recent.push(m); } if (recent.length >= 8) break; }
  $("recent-meals").hidden = !recent.length;
  $("recent-meals").innerHTML = recent.map((m) => `<button type="button" data-recent="${esc(m.id)}">${esc(m.name)}</button>`).join("");

  renderSupplements(d);
  renderCustom();

  $("meal-list").innerHTML = ms.length ? ms.map((m) =>
    `<li class="item"><div class="badge light">${MEAL_BADGE[m.type] || esc([...m.type].slice(0, 2).join(""))}</div><div class="body"><b>${esc(m.name)}</b>${chips(m.type === "サプリ"
      ? [m.dose && esc(m.dose), m.kcal > 0 && `${m.kcal}kcal`, m.p > 0 && `P ${m.p}g`]
      : [`${m.kcal}kcal`, `P ${m.p}g`, `F ${m.f}g`, `C ${m.c}g`])}</div>${delBtn("meals", m.id)}</li>`).join("")
    : empty("この日の食事記録はありません");
}

function renderBody() {
  const h = db.profile.height;
  if (document.activeElement !== $("b-height")) $("b-height").value = h || "";
  const bs = [...db.body].sort((a, b) => b.date.localeCompare(a.date));

  if (bs.length) {
    const b = bs[0], p = bs[1], x = bodyDerived(b, h), px = p ? bodyDerived(p, h) : {};
    const dl = (c, q) => (q != null ? `前回比 ${delta(c, q)}` : "");
    $("body-cards").innerHTML =
      card("体重", b.weight, "kg " + dl(b.weight, p?.weight), "dark") +
      (b.fat ? card("体脂肪率", b.fat, "% " + dl(b.fat, p?.fat)) : "") +
      (b.muscle ? card("筋肉量", b.muscle, "kg " + dl(b.muscle, p?.muscle)) : "") +
      (x.bmi ? card("BMI", round(x.bmi), dl(round(x.bmi), px.bmi != null ? round(px.bmi) : null)) : "") +
      (x.fatMass ? card("体脂肪量", round(x.fatMass), "kg") : "") +
      (x.lbm ? card("除脂肪体重", round(x.lbm), "kg") : "");
  } else {
    $("body-cards").innerHTML = '<p class="hint hint-card">体重を記録すると、BMI・体脂肪量・除脂肪体重が自動計算されます</p>';
  }

  $("body-list").innerHTML = bs.length ? bs.slice(0, 14).map((b) => {
    const x = bodyDerived(b, h);
    return `<li class="item"><div class="badge light">${b.date.slice(5).replace("-", "/")}</div><div class="body"><b>${b.weight} kg</b>${chips([
      b.fat && `体脂肪 ${b.fat}%`, b.muscle && `筋肉量 ${b.muscle}kg`, x.bmi && `BMI ${round(x.bmi)}`, x.lbm && `除脂肪 ${round(x.lbm)}kg`])}</div>${delBtn("body", b.id)}</li>`;
  }).join("") : empty("まだ記録がありません");

  const m = BODY_METRICS[$("body-metric").value];
  const pts = [...db.body].sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({ date: b.date, v: m.get(b, h) })).filter((q) => q.v != null).slice(-30);
  drawLine($("body-chart"), pts, m.unit);
}

function renderAnalysis(d) {
  renderRmCalc();

  // 種目別
  const names = [...new Set(db.workouts.filter((w) => w.weight > 0).map((w) => w.exercise))].sort();
  const sel = $("an-exercise"), prev = sel.value;
  sel.innerHTML = names.length ? names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("") : "<option value=''>(記録なし)</option>";
  if (names.includes(prev)) sel.value = prev;

  const list = db.workouts.filter((w) => w.exercise === sel.value && w.weight > 0);
  if (list.length) {
    const best = Math.max(...list.map((w) => est1RM(w.weight, w.reps)));
    $("an-cards").innerHTML =
      card("最高 推定1RM", round(best), "kg", "dark") +
      card("最大重量", Math.max(...list.map((w) => w.weight)), "kg") +
      card("総セット数", sum(list, (w) => w.sets), "set") +
      card("総負荷量", num(totalVolume(list)), "kg");
    const byDate = {};
    list.forEach((w) => (byDate[w.date] = Math.max(byDate[w.date] || 0, est1RM(w.weight, w.reps))));
    drawLine($("an-chart"), Object.keys(byDate).sort().map((dt) => ({ date: dt, v: byDate[dt] })).slice(-30), "kg");
  } else {
    $("an-cards").innerHTML = '<p class="hint hint-card">トレーニングを記録すると、種目ごとの推移が表示されます</p>';
    drawLine($("an-chart"), [], "");
  }

  // 週ごと(直近8週)
  const [thisStart] = weekRange(d);
  const weeks = Array.from({ length: 8 }, (_, i) => shiftDate(thisStart, -7 * (7 - i)));
  drawBars($("weekly-chart"), weeks.map((s) => ({ label: s.slice(5).replace("-", "/"), v: totalVolume(inRange(db.workouts, s, shiftDate(s, 6))) })), { highlight: 7 });

  // 部位別(選択月): 上位5つ + その他
  const byPart = {};
  db.workouts.filter((w) => w.date.slice(0, 7) === d.slice(0, 7)).forEach((w) => (byPart[w.part] = (byPart[w.part] || 0) + volume(w)));
  let parts = Object.entries(byPart).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (parts.length > 6) parts = [...parts.slice(0, 5), ["その他", sum(parts.slice(5), (p) => p[1])]];
  const total = sum(parts, (p) => p[1]);
  drawDonut($("part-donut"), parts.map(([label, v]) => ({ label, v })), num(total), "kg");
  $("part-legend").innerHTML = parts.length
    ? parts.map(([p, v], i) => `<div><i style="background:${SHADES[i]}"></i>${esc(p)}<b>${Math.round((v / total) * 100)}% · ${num(v)}kg</b></div>`).join("")
    : '<span class="hint">この月の記録はありません</span>';
}

function renderStats(d) {
  if (!$("style-form").contains(document.activeElement)) {
    const st = style();
    $("s-split").value = st.split || "auto";
    $("s-days").value = st.days || 3;
    $("s-level").value = st.level || "beginner";
    $("s-goal").value = st.goal || "hypertrophy";
    $("s-equip").value = st.equip || "gym";
    $("s-minutes").value = st.minutes || "";
    $("s-note").value = st.note || "";
  }
  $("g-kcal").value = db.goal.kcal || "";
  $("g-p").value = db.goal.p || "";
  const ms = db.meals.filter((m) => m.date === d);
  const kcal = sum(ms, (m) => m.kcal), p = sum(ms, (m) => m.p);
  drawRing($("ring-kcal"), db.goal.kcal ? kcal / db.goal.kcal : 0, db.goal.kcal ? Math.round((kcal / db.goal.kcal) * 100) + "%" : "—", `${num(kcal)}kcal`);
  drawRing($("ring-p"), db.goal.p ? p / db.goal.p : 0, db.goal.p ? Math.round((p / db.goal.p) * 100) + "%" : "—", `${round(p)}g`);

  const days = Array.from({ length: 14 }, (_, i) => shiftDate(d, i - 13));
  const sumDay = (dt, k) => sum(db.meals.filter((m) => m.date === dt), (m) => m[k]);
  drawBars($("kcal-chart"), days.map((dt) => ({ label: dt.slice(8), v: sumDay(dt, "kcal") })), { highlight: 13 });
  drawBars($("protein-chart"), days.map((dt) => ({ label: dt.slice(8), v: sumDay(dt, "p") })), { highlight: 13 });
  drawBars($("days-chart"), days.map((dt) => ({ label: dt.slice(8), v: totalVolume(db.workouts.filter((w) => w.date === dt)) })), { highlight: 13 });

  const dates = [...new Set([...db.workouts, ...db.meals].map((r) => r.date))].sort().reverse().slice(0, 14);
  $("history").innerHTML = dates.length ? dates.map((dt) => {
    const w = db.workouts.filter((x) => x.date === dt), m = db.meals.filter((x) => x.date === dt);
    return `<li class="item"><div class="badge light">${dt.slice(5).replace("-", "/")}</div><div class="body"><b>${DOW[parseDate(dt).getDay()]}曜日</b>${chips([
      w.length && `${new Set(w.map((x) => x.exercise)).size}種目`, w.length && `負荷量 ${num(totalVolume(w))}kg`, m.length && `${round(sum(m, (x) => x.kcal))}kcal`])}</div></li>`;
  }).join("") : empty("まだ記録がありません");
}

// 提出用デモ(demo/ の単一HTML)では、データが空のときサンプルを自動投入する
if (window.DEMO_AUTOLOAD && !db.workouts.length && !db.meals.length && !db.body.length) {
  db = buildDemoData();
  Store.save(db);
}

render();
