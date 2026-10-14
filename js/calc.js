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
