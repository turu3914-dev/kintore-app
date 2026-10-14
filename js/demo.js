// デモ用のサンプルデータ生成(直近8週間分)。乱数は固定シードなので毎回同じ内容になる。
function buildDemoData() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const id = () => Store.newId() + Math.floor(rnd() * 1e4);
  const db = emptyDb();
  db.profile = { height: 172 };
  db.goal = { kcal: 2800, p: 140 };

  // 曜日(0=日)ごとの分割: 月=胸 水=背中 金=脚 土=肩・腕
  const split = {
    1: [["胸", "ベンチプレス", 60, 8], ["胸", "インクラインプレス", 40, 10], ["胸", "ダンベルフライ", 14, 12]],
    3: [["背中", "デッドリフト", 80, 5], ["背中", "ラットプルダウン", 45, 10], ["背中", "シーテッドロウ", 40, 10]],
    5: [["脚", "スクワット", 70, 8], ["脚", "レッグプレス", 120, 10], ["脚", "レッグカール", 30, 12]],
    6: [["肩", "ショルダープレス", 30, 10], ["肩", "サイドレイズ", 8, 15], ["腕", "バーベルカール", 25, 10]],
  };
  const meals = [
    ["朝食", "オートミール(40g)", 152, 5.4, 2.8, 27.6], ["朝食", "卵(1個)", 76, 6.2, 5.2, 0.2],
    ["昼食", "白米(150g)", 252, 3.8, 0.5, 55.7], ["昼食", "鶏むね肉(100g)", 108, 22.3, 1.5, 0],
    ["夕食", "白米(150g)", 252, 3.8, 0.5, 55.7], ["夕食", "鶏むね肉(100g)", 216, 44.6, 3, 0],
    ["夕食", "納豆(1パック)", 90, 7.4, 4.5, 5.4], ["プロテイン", "プロテイン(1杯)", 120, 24, 1.5, 3],
  ];

  const DAYS = 56;
  const now = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const dt = new Date(now);
    dt.setDate(now.getDate() - i);
    const date = fmtDate(dt);
    const progress = (DAYS - i) / DAYS; // 時間とともに重量が伸びる

    for (const [part, exercise, w, reps] of split[dt.getDay()] || []) {
      const weight = Math.round((w * (0.9 + 0.14 * progress)) / 2.5) * 2.5;
      db.workouts.push({ id: id(), date, part, exercise, weight, reps: reps + (rnd() < 0.3 ? 1 : 0), sets: 3 + (rnd() < 0.4 ? 1 : 0) });
    }
    if (dt.getDay() !== 0 || rnd() < 0.5) {
      for (const [type, name, kcal, p, f, c] of meals) db.meals.push({ id: id(), date, type, name, kcal, p, f, c });
    }
    if (i % 3 === 0) {
      const weight = round(72 - 1.5 * progress + (rnd() - 0.5) * 0.6);
      db.body.push({ id: id(), date, weight, fat: round(18 - 1.8 * progress + (rnd() - 0.5) * 0.4), muscle: round(30.5 + 0.8 * progress) });
    }
  }
  return db;
}
