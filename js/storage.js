// localStorage への保存・読み込み。
// データ構造: { workouts: [], meals: [], body: [], goal: {kcal, p}, profile: {height}, customExercises: [{id, part, name}], customFoods: [{id, kind: "food"|"supp", name, dose, kcal, p, f, c}], customMealTypes: [{id, name}] }
// 各レコードは date(YYYY-MM-DD) と id を持つ。
const KEY = "kintore-app-v1";

const emptyDb = () => ({ workouts: [], meals: [], body: [], goal: {}, profile: {}, customExercises: [], customFoods: [], customMealTypes: [] });

const Store = {
  load() {
    try {
      return Object.assign(emptyDb(), JSON.parse(localStorage.getItem(KEY)));
    } catch {
      return emptyDb();
    }
  },
  save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} // 保存できない環境でも画面は動かす
  },
  newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },
};

// ファイル保存。Claudeアーティファクト内ではダウンロード用の機能を、通常のブラウザではaタグを使う
async function saveFile(blob, filename) {
  try {
    const dl = window.claude ? await window.claude.use("downloads") : null;
    if (dl) { await dl.save({ filename, data: blob }); return; }
  } catch (e) {
    if (e && e.code === "declined") return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
