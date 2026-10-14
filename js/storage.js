// localStorage への保存・読み込み。
// データ構造: { workouts: [], meals: [], body: [], goal: {kcal, p}, profile: {height} }
// 各レコードは date(YYYY-MM-DD) と id を持つ。
const KEY = "kintore-app-v1";

const emptyDb = () => ({ workouts: [], meals: [], body: [], goal: {}, profile: {} });

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
