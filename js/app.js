const $ = (id) => document.getElementById(id);
let db = Store.load();

const today = () => fmtDate(new Date());
const curDate = () => $("date").value || today();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Math.round(n).toLocaleString();

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

// ---- 初期化 ----
$("date").value = today();
$("date").addEventListener("change", render);

for (const part of Object.keys(EXERCISES)) $("w-part").add(new Option(part, part));
function fillExerciseList() {
  $("exercise-list").innerHTML = EXERCISES[$("w-part").value].map((e) => `<option value="${e}">`).join("");
}
$("w-part").addEventListener("change", fillExerciseList);
fillExerciseList();

$("food-list").innerHTML = FOODS.map((f) => `<option value="${f[0]}">`).join("");
$("m-name").addEventListener("input", () => {
  const f = FOODS.find((x) => x[0] === $("m-name").value);
  if (f) { $("m-kcal").value = f[1]; $("m-p").value = f[2]; $("m-f").value = f[3]; $("m-c").value = f[4]; }
});

for (const [k, m] of Object.entries(BODY_METRICS)) $("body-metric").add(new Option(m.label, k));
$("body-metric").addEventListener("change", render);
$("an-exercise").addEventListener("change", render);

document.querySelectorAll("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== "tab-" + b.dataset.tab));
    render();
  })
);

// ---- フォーム ----
function updateRmPreview() {
  const w = +$("w-weight").value, r = +$("w-reps").value;
  $("rm-preview").textContent = w > 0 && r > 0 ? `推定1RM: ${round(est1RM(w, r))}kg ／ 1セットの負荷量: ${num(w * r)}kg` : "";
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
  persist();
});

$("meal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  db.meals.push({
    id: Store.newId(), date: curDate(), type: $("m-type").value, name: $("m-name").value.trim(),
    kcal: +$("m-kcal").value, p: +$("m-p").value || 0, f: +$("m-f").value || 0, c: +$("m-c").value || 0,
  });
  e.target.reset();
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
  if (!(w > 0 && r > 0)) { $("rm-result").innerHTML = '<p class="hint">重量と回数を入力すると、推定1RMと各回数の目安重量を表示します(Epley式)</p>'; return; }
  const rm = est1RM(w, r);
  const rows = Array.from({ length: 12 }, (_, i) => i + 1).map((n) =>
    `<tr><td>${n}RM</td><td>${round(weightAtReps(rm, n))} kg</td><td>${Math.round((weightAtReps(rm, n) / rm) * 100)}%</td></tr>`).join("");
  $("rm-result").innerHTML = `<p class="summary">推定1RM: ${round(rm)} kg</p><table><tr><th>回数</th><th>重量</th><th>%1RM</th></tr>${rows}</table>`;
}
$("rm-form").addEventListener("input", renderRmCalc);

// ---- データ入出力 ----
$("export").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }));
  a.download = `kintore-${today()}.json`;
  a.click();
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
    alert("読み込めないファイルです");
  }
  e.target.value = "";
});

$("load-demo").addEventListener("click", () => {
  if (!confirm("現在のデータはデモデータで置き換えられます。よろしいですか?")) return;
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
const card = (label, value, unit = "") => `<div class="card"><span>${label}</span><b>${value}</b><small>${unit}</small></div>`;
document.addEventListener("click", (e) => {
  const b = e.target.closest(".del");
  if (b) remove(b.dataset.kind, b.dataset.id);
});

function render() {
  const d = curDate();
  renderWorkout(d);
  renderMeals(d);
  renderBody();
  renderAnalysis(d);
  renderRmCalc();
  renderStats(d);
}

function renderWorkout(d) {
  const ws = db.workouts.filter((w) => w.date === d);
  const [from, to] = weekRange(d);
  $("volume-cards").innerHTML =
    card("1日", num(totalVolume(ws)), "kg") +
    card("今週", num(totalVolume(inRange(db.workouts, from, to))), "kg") +
    card("今月", num(totalVolume(db.workouts.filter((w) => w.date.slice(0, 7) === d.slice(0, 7)))), "kg") +
    card("通算", num(totalVolume(db.workouts)), "kg");

  $("workout-list").innerHTML = ws.map((w) =>
    `<li><span>[${esc(w.part)}] ${esc(w.exercise)} — ${w.weight}kg × ${w.reps}回 × ${w.sets}セット
      <small class="muted">推定1RM ${round(est1RM(w.weight, w.reps))}kg ／ 負荷量 ${num(volume(w))}kg</small></span>${delBtn("workouts", w.id)}</li>`).join("");
  $("workout-summary").textContent = ws.length
    ? `この日の総負荷量: ${num(totalVolume(ws))} kg(${ws.length}件)`
    : "この日のトレーニング記録はありません";
}

function renderMeals(d) {
  const ms = db.meals.filter((m) => m.date === d);
  $("meal-list").innerHTML = ms.map((m) =>
    `<li><span>[${esc(m.type)}] ${esc(m.name)} — ${m.kcal}kcal (P${m.p} F${m.f} C${m.c})</span>${delBtn("meals", m.id)}</li>`).join("");
  $("meal-summary").textContent = ms.length
    ? `合計: ${round(sum(ms, (m) => m.kcal))}kcal / P ${round(sum(ms, (m) => m.p))}g / F ${round(sum(ms, (m) => m.f))}g / C ${round(sum(ms, (m) => m.c))}g`
    : "この日の食事記録はありません";
}

function renderBody() {
  const h = db.profile.height;
  if (document.activeElement !== $("b-height")) $("b-height").value = h || "";
  const bs = [...db.body].sort((a, b) => b.date.localeCompare(a.date));

  if (bs.length) {
    const b = bs[0], x = bodyDerived(b, h);
    $("body-cards").innerHTML =
      card("体重", b.weight, "kg") +
      (b.fat ? card("体脂肪率", b.fat, "%") : "") +
      (b.muscle ? card("筋肉量", b.muscle, "kg") : "") +
      (x.bmi ? card("BMI", round(x.bmi), "") : "") +
      (x.fatMass ? card("体脂肪量", round(x.fatMass), "kg") : "") +
      (x.lbm ? card("除脂肪体重", round(x.lbm), "kg") : "");
  } else {
    $("body-cards").innerHTML = '<p class="hint">体重を記録すると、BMI・体脂肪量・除脂肪体重が自動計算されます</p>';
  }

  $("body-list").innerHTML = bs.slice(0, 14).map((b) => {
    const x = bodyDerived(b, h);
    const parts = [`${b.weight}kg`, b.fat && `体脂肪 ${b.fat}%`, b.muscle && `筋肉量 ${b.muscle}kg`, x.bmi && `BMI ${round(x.bmi)}`, x.lbm && `除脂肪 ${round(x.lbm)}kg`].filter(Boolean);
    return `<li><span>${b.date} — ${parts.join(" / ")}</span>${delBtn("body", b.id)}</li>`;
  }).join("");

  const m = BODY_METRICS[$("body-metric").value];
  const pts = [...db.body].sort((a, b) => a.date.localeCompare(b.date))
    .map((b) => ({ date: b.date, v: m.get(b, h) })).filter((p) => p.v != null).slice(-30);
  drawLine($("body-chart"), pts, m.unit);
}

function barRow(label, value, max, extra = "") {
  return `<div class="barrow"><span>${esc(label)}</span><div class="bar"><div style="width:${max ? (value / max) * 100 : 0}%"></div></div><span class="num">${num(value)}${extra}</span></div>`;
}

function renderAnalysis(d) {
  // 種目別
  const names = [...new Set(db.workouts.filter((w) => w.weight > 0).map((w) => w.exercise))].sort();
  const sel = $("an-exercise"), prev = sel.value;
  sel.innerHTML = names.length ? names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("") : "<option value=''>(記録なし)</option>";
  if (names.includes(prev)) sel.value = prev;

  const list = db.workouts.filter((w) => w.exercise === sel.value && w.weight > 0);
  if (list.length) {
    const best = Math.max(...list.map((w) => est1RM(w.weight, w.reps)));
    $("an-cards").innerHTML =
      card("最高 推定1RM", round(best), "kg") +
      card("最大重量", Math.max(...list.map((w) => w.weight)), "kg") +
      card("総セット数", sum(list, (w) => w.sets), "set") +
      card("総負荷量", num(totalVolume(list)), "kg");
    const byDate = {};
    list.forEach((w) => (byDate[w.date] = Math.max(byDate[w.date] || 0, est1RM(w.weight, w.reps))));
    drawLine($("an-chart"), Object.keys(byDate).sort().map((dt) => ({ date: dt, v: byDate[dt] })).slice(-30), "推定1RM(kg)");
  } else {
    $("an-cards").innerHTML = '<p class="hint">トレーニングを記録すると、種目ごとの推移が表示されます</p>';
    drawLine($("an-chart"), [], "");
  }

  // 週ごと(直近8週)
  const [thisStart] = weekRange(d);
  const weeks = Array.from({ length: 8 }, (_, i) => shiftDate(thisStart, -7 * (7 - i)));
  const vols = weeks.map((s) => totalVolume(inRange(db.workouts, s, shiftDate(s, 6))));
  const maxV = Math.max(...vols, 1);
  $("weekly-bars").innerHTML = weeks.map((s, i) => barRow(s.slice(5) + "〜", vols[i], maxV, " kg")).join("");

  // 部位別(選択月)
  const month = db.workouts.filter((w) => w.date.slice(0, 7) === d.slice(0, 7));
  const byPart = {};
  month.forEach((w) => (byPart[w.part] = (byPart[w.part] || 0) + volume(w)));
  const parts = Object.entries(byPart).sort((a, b) => b[1] - a[1]);
  const total = sum(parts, (p) => p[1]);
  $("part-bars").innerHTML = parts.length
    ? parts.map(([p, v]) => barRow(p, v, parts[0][1], ` kg (${total ? Math.round((v / total) * 100) : 0}%)`)).join("")
    : '<p class="hint">この月の記録はありません</p>';
}

function renderStats(d) {
  $("g-kcal").value = db.goal.kcal || "";
  $("g-p").value = db.goal.p || "";
  const ms = db.meals.filter((m) => m.date === d);
  const items = [["kcal", "kcal", sum(ms, (m) => m.kcal)], ["p", "タンパク質(g)", sum(ms, (m) => m.p)]];
  $("goal-progress").innerHTML = items.filter(([k]) => db.goal[k]).map(([k, label, v]) =>
    `<p>${label}: ${round(v)} / ${db.goal[k]}</p><div class="bar"><div style="width:${Math.min(100, (v / db.goal[k]) * 100)}%"></div></div>`).join("")
    || '<p class="hint">目標を設定すると、選択日の達成度が表示されます</p>';

  const dates = [...new Set([...db.workouts, ...db.meals].map((r) => r.date))].sort().reverse().slice(0, 14);
  $("history").innerHTML = dates.map((dt) => {
    const w = db.workouts.filter((x) => x.date === dt), m = db.meals.filter((x) => x.date === dt);
    return `<div class="day"><b>${dt}</b><br>種目 ${new Set(w.map((x) => x.exercise)).size}件 / 負荷量 ${num(totalVolume(w))}kg / ${round(sum(m, (x) => x.kcal))}kcal</div>`;
  }).join("") || '<p class="hint">まだ記録がありません</p>';
}

// 提出用デモ(demo/ の単一HTML)では、データが空のときサンプルを自動投入する
if (window.DEMO_AUTOLOAD && !db.workouts.length && !db.meals.length && !db.body.length) {
  db = buildDemoData();
  Store.save(db);
}

render();
