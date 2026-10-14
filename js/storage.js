// localStorage への保存・読み込み。
// データ構造: { workouts: [], meals: [], body: [], goal: {kcal, p}, profile: {height}, customExercises: [{id, part, name}], customFoods: [{id, kind: "food"|"supp", name, dose, kcal, p, f, c}], customMealTypes: [{id, name}] }
// 各レコードは date(YYYY-MM-DD) と id を持つ。
const KEY = "kintore-app-v1";

const emptyDb = () => ({ workouts: [], meals: [], body: [], goal: {}, profile: {}, customExercises: [], customFoods: [], customMealTypes: [] });

const BACKUP_KEY = KEY + "-backup"; // 直前の保存内容(1世代)
const SAFE_KEY = KEY + "-before-replace"; // デモ読込・インポートで置き換える直前の退避

const Store = {
  load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { return emptyDb(); }
    if (!raw) return emptyDb();
    try {
      return Object.assign(emptyDb(), JSON.parse(raw));
    } catch {
      // 壊れていても消さない。退避してから空で始める(上書きで失われるのを防ぐ)
      try { localStorage.setItem(KEY + "-corrupt", raw); } catch {}
      return emptyDb();
    }
  },
  save(db) {
    try {
      const next = JSON.stringify(db);
      const prev = localStorage.getItem(KEY);
      if (prev && prev !== next) localStorage.setItem(BACKUP_KEY, prev);
      localStorage.setItem(KEY, next);
    } catch {} // 保存できない環境でも画面は動かす
  },
  // 全置換の前に現在のデータを退避する
  snapshot() {
    try { const cur = localStorage.getItem(KEY); if (cur) localStorage.setItem(SAFE_KEY, cur); } catch {}
  },
  // 退避・バックアップ・破損データのうち最も新しい復元元を返す(なければ null)
  recoverable() {
    try {
      for (const k of [SAFE_KEY, BACKUP_KEY, KEY + "-corrupt"]) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const d = JSON.parse(raw);
        if (d && (d.workouts || []).length + (d.meals || []).length + (d.body || []).length) return Object.assign(emptyDb(), d);
      }
    } catch {}
    return null;
  },
  // ブラウザによる自動削除を避けるため永続化を要求する
  persistent() { try { return navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false); } catch { return Promise.resolve(false); } },
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
