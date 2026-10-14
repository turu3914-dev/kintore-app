// localStorage への保存・読み込み。
// データ構造: { workouts: [], meals: [], body: [], goal: {kcal, p}, profile: {height}, customExercises: [{id, part, name}] }
// 各レコードは date(YYYY-MM-DD) と id を持つ。
const KEY = "kintore-app-v1";

const emptyDb = () => ({ workouts: [], meals: [], body: [], goal: {}, profile: {}, customExercises: [] });

const Store = {
  load() {
    try {
      return Object.assign(emptyDb(), JSON.parse(localStorage.getItem(KEY)));
    } catch {
      return emptyDb();
    }
  },
  save(db) {
    localStorage.setItem(KEY, JSON.stringify(db));
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
