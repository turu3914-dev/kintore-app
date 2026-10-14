// 計算ロジック(画面に依存しない)

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const fmtDate = (dt) => dt.toLocaleDateString("sv-SE"); // YYYY-MM-DD
const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

// 負荷量 = 重量 × 回数 × セット数
const volume = (w) => w.weight * w.reps * w.sets;
const totalVolume = (list) => sum(list, volume);

// Epley式: 1RM = 重量 × (1 + 回数/30)
const est1RM = (weight, reps) => (reps <= 1 ? weight : weight * (1 + reps / 30));
// 1RMから n回できる重量
const weightAtReps = (rm, n) => (n <= 1 ? rm : rm / (1 + n / 30));

// 週は月曜始まり。[月曜, 日曜] を返す
function weekRange(dateStr) {
  const d = parseDate(dateStr);
  const start = new Date(d);
  start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [fmtDate(start), fmtDate(end)];
}
const shiftDate = (dateStr, days) => { const d = parseDate(dateStr); d.setDate(d.getDate() + days); return fmtDate(d); };

const inRange = (list, from, to) => list.filter((r) => r.date >= from && r.date <= to);

// 体組成の派生値
function bodyDerived(b, heightCm) {
  const bmi = heightCm ? b.weight / (heightCm / 100) ** 2 : null;
  const fatMass = b.fat ? (b.weight * b.fat) / 100 : null;
  return { bmi, fatMass, lbm: fatMass != null ? b.weight - fatMass : null };
}

// ---- おすすめ(漸進性過負荷・次の種目) ----

const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const weightStep = (w) => (w < 20 ? 1 : 2.5);
const snap = (v, step) => Math.max(step, Math.round(v / step) * step);

// 種目ごとの記録を日付単位にまとめる(upTo 以前、重量ありのみ)
function sessionsOf(workouts, exercise, upTo) {
  const by = {};
  workouts.filter((w) => w.exercise === exercise && w.weight > 0 && w.date <= upTo).forEach((w) => (by[w.date] ||= []).push(w));
  return Object.keys(by).sort().map((date) => ({ date, rows: by[date] }));
}

// 次回の重量・回数・セット数の目安。記録が無ければ null
function nextTarget(workouts, exercise, upTo, goal = null) {
  const ss = sessionsOf(workouts, exercise, upTo);
  if (!ss.length) return null;
  const last = ss[ss.length - 1];
  const top = last.rows.reduce((a, b) => (est1RM(b.weight, b.reps) > est1RM(a.weight, a.reps) ? b : a));
  const sets = Math.min(5, Math.max(2, sum(last.rows, (r) => r.sets)));
  const step = weightStep(top.weight);
  let ceil = top.reps <= 6 ? 6 : top.reps <= 12 ? 12 : 15;
  let floor = { 6: 4, 12: 8, 15: 12 }[ceil];
  // 目的で回数帯を寄せる: 筋力は低め、減量・健康維持は高め
  const band = { strength: [8, 5], fatloss: [15, 10], health: [15, 10] }[goal];
  if (band) [ceil, floor] = band;
  const prevTxt = `前回 ${top.weight}kg×${top.reps}回`;

  const bests = ss.map((s) => Math.max(...s.rows.map((r) => est1RM(r.weight, r.reps))));
  const stagnant = ss.length >= 4 && Math.max(...bests.slice(-3)) <= Math.max(...bests.slice(0, -3)) * 1.005;
  const gap = daysBetween(last.date, upTo);

  if (gap >= 14) return { weight: snap(top.weight * 0.9, 0.5), reps: top.reps, sets, reason: `${prevTxt}から${gap}日空いたので、10%軽くして再開` };
  if (stagnant) return { weight: snap(top.weight * 0.9, 0.5), reps: top.reps + 2, sets, reason: `直近3回は自己ベスト更新なし。10%軽くして回数を増やし、立て直し` };
  if (top.reps >= ceil) return { weight: top.weight + step, reps: floor, sets, reason: `${prevTxt}で${ceil}回に到達 → 重量アップ(+${step}kg)` };
  return { weight: top.weight, reps: top.reps + 1, sets, reason: `${prevTxt} → 同じ重量であと1回(${ceil}回で重量アップ)` };
}

// 分割法から「今日のグループ」を決める。今日すでに記録があればその続き、無ければ最後の実施が最も古いグループ
function todayGroup(split, workouts, d) {
  if (!split || !split.groups) return null;
  const todayParts = new Set(workouts.filter((w) => w.date === d).map((w) => w.part));
  let best = null, bestN = 0;
  split.groups.forEach((g) => { const n = g.parts.filter((p) => todayParts.has(p)).length; if (n > bestN) { best = g; bestN = n; } });
  if (best) return { group: best, continuing: true };
  const lastOf = (g) => g.parts.reduce((m, p) => workouts.filter((w) => w.part === p && w.date < d).reduce((a, w) => (w.date > a ? w.date : a), m), "");
  const group = [...split.groups].sort((a, b) => lastOf(a).localeCompare(lastOf(b)))[0];
  return { group, continuing: false };
}

// 次にやる種目の候補(最大3件)。catalog: { 部位: [種目名...] }(先頭ほど優先)。split があれば今日のグループの部位に絞る
function recommendNext(workouts, d, catalog, split = null, goal = null) {
  const todayRows = workouts.filter((w) => w.date === d);
  const done = new Set(todayRows.map((w) => w.exercise));
  const history = workouts.filter((w) => w.date < d);
  const partOf = {};
  Object.entries(catalog).forEach(([p, list]) => list.forEach((e) => (partOf[e] ||= p)));
  workouts.forEach((w) => (partOf[w.exercise] = w.part));
  const tg = todayGroup(split, workouts, d);

  const freq = {};
  history.forEach((w) => (freq[w.exercise] = (freq[w.exercise] || 0) + 1));
  const out = [];
  const add = (exercise, reason) => {
    if (!exercise || done.has(exercise) || out.some((o) => o.exercise === exercise) || out.length >= 3) return;
    if (tg && !tg.group.parts.includes(partOf[exercise] || "その他")) return; // 分割法の対象外の部位は出さない
    out.push({ exercise, part: partOf[exercise] || "その他", reason, target: nextTarget(workouts, exercise, d, goal) });
  };

  const last = todayRows[todayRows.length - 1];
  if (last) {
    // 1. 過去に「この種目の次」にやった種目
    const trans = {};
    const byDay = {};
    history.forEach((w) => (byDay[w.date] ||= []).push(w.exercise));
    Object.values(byDay).forEach((names) => {
      const seq = names.filter((n, i) => n !== names[i - 1]);
      seq.forEach((n, i) => { if (i && seq[i - 1] === last.exercise) trans[n] = (trans[n] || 0) + 1; });
    });
    Object.entries(trans).sort((a, b) => b[1] - a[1]).slice(0, 1)
      .forEach(([n, c]) => add(n, `いつも「${last.exercise}」の後に行っています(${c}回)`));

    // 2. 同じ部位が3種目に満たなければ、同部位の別種目
    const sameDone = new Set(todayRows.filter((w) => w.part === last.part).map((w) => w.exercise)).size;
    if (sameDone < 3) {
      (catalog[last.part] || []).map((e, i) => [e, i])
        .sort((a, b) => (freq[b[0]] || 0) - (freq[a[0]] || 0) || a[1] - b[1])
        .forEach(([e]) => add(e, `${last.part}はあと${3 - sameDone}種目で標準的なボリューム`));
    }
  }

  const lastDay = {};
  workouts.filter((w) => w.date <= d && w.weight > 0).forEach((w) => (lastDay[w.part] = w.date > (lastDay[w.part] || "") ? w.date : lastDay[w.part]));
  const pick = (p) => (catalog[p] || []).filter((e) => !done.has(e)).sort((a, b) => (freq[b] || 0) - (freq[a] || 0));

  if (tg) {
    // 3a. 分割法の「今日のグループ」の部位を、空いている順に1種目ずつ → 残りを追加
    // 記録のある部位を空いている順に。記録の無い部位は後ろ(グループ内の並び=主要部位が先)
    const parts = [...tg.group.parts].sort((a, b) => (lastDay[a] || "9999").localeCompare(lastDay[b] || "9999"));
    const why = `${split.label}:今日は「${tg.group.name}」の日`;
    parts.forEach((p) => add(pick(p)[0], why));
    parts.forEach((p) => pick(p).forEach((e) => add(e, why)));
  } else {
    // 3b. 分割法が未設定: 最も休ませている部位(今日やっていない部位)
    const trainedToday = new Set(todayRows.map((w) => w.part));
    Object.entries(lastDay).filter(([p]) => !trainedToday.has(p)).sort((a, b) => a[1].localeCompare(b[1])).forEach(([p, dt]) => {
      add(pick(p)[0], `${p}は${daysBetween(dt, d)}日空いています`);
    });
  }

  // 記録がまったく無い場合の入門メニュー
  if (!out.length && !workouts.length && !tg) ["ベンチプレス", "スクワット", "デッドリフト"].forEach((e) => add(e, "まずは基本のBIG3から"));
  return out;
}
