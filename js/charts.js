// canvas 描画(折れ線・棒・ドーナツ・リング・画像出力)。高解像度画面に対応。

const CH = { black: "#191919", mid: "#787774", muted: "#9b9a97", light: "#cfcfcb", border: "#e9e9e7" };
const SHADES = ["#191919", "#4a4a48", "#787774", "#a8a7a3", "#cfcfcb", "#e9e9e7"];

// CSSサイズに合わせて解像度を設定。非表示(サイズ0)なら null
function prepare(cv) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return null;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = "11px sans-serif";
  return { ctx, w, h };
}

const compact = (v) => (v >= 10000 ? Math.round(v / 1000) + "k" : v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v)));

function emptyMessage(ctx, w, h, text) {
  ctx.fillStyle = CH.muted;
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2);
  ctx.textAlign = "left";
}

function drawLine(cv, pts, unit) {
  const p = prepare(cv); if (!p) return;
  const { ctx, w, h } = p;
  if (pts.length < 2) return emptyMessage(ctx, w, h, "グラフにはデータが2件以上必要です");
  const vs = pts.map((q) => q.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (min === max) { min -= 1; max += 1; }
  const m = (max - min) * 0.15; min -= m; max += m;
  const L = 38, R = 14, T = 24, B = 24;
  const x = (i) => L + (i / (pts.length - 1)) * (w - L - R);
  const y = (v) => h - B - ((v - min) / (max - min)) * (h - T - B);

  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    ctx.strokeStyle = CH.border;
    ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(w - R, y(v)); ctx.stroke();
    ctx.fillStyle = CH.muted;
    ctx.fillText(round(v).toString(), 2, y(v) + 4);
  }
  // 面を薄く塗る
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(x(i), y(q.v)) : ctx.moveTo(x(i), y(q.v))));
  ctx.lineTo(x(pts.length - 1), h - B); ctx.lineTo(x(0), h - B); ctx.closePath();
  ctx.fillStyle = "rgba(25,25,25,0.06)"; ctx.fill();
  // 線と点
  ctx.strokeStyle = CH.black; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(x(i), y(q.v)) : ctx.moveTo(x(i), y(q.v))));
  ctx.stroke();
  pts.forEach((q, i) => {
    ctx.beginPath(); ctx.arc(x(i), y(q.v), i === pts.length - 1 ? 4.5 : 2.5, 0, 7);
    ctx.fillStyle = i === pts.length - 1 ? CH.black : "#fff"; ctx.fill();
    ctx.lineWidth = 1.5; ctx.stroke();
  });
  // 最新値ラベル
  const last = pts[pts.length - 1];
  ctx.fillStyle = CH.black; ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "right"; ctx.fillText(`${round(last.v)}${unit ? " " + unit : ""}`, w - R, 13);
  ctx.font = "11px sans-serif"; ctx.fillStyle = CH.muted;
  ctx.textAlign = "left"; ctx.fillText(pts[0].date.slice(5), L, h - 7);
  ctx.textAlign = "right"; ctx.fillText(last.date.slice(5), w - R, h - 7);
  ctx.textAlign = "left";
}

// items: [{label, v}]。highlight の棒だけ黒、他はグレー
function drawBars(cv, items, { highlight = -1 } = {}) {
  const p = prepare(cv); if (!p) return;
  const { ctx, w, h } = p;
  const T = 20, B = 22, pad = 6;
  const max = Math.max(...items.map((i) => i.v), 1);
  const slot = (w - pad * 2) / items.length, bw = Math.min(slot * 0.62, 38);
  ctx.strokeStyle = CH.border; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, h - B + 0.5); ctx.lineTo(w - pad, h - B + 0.5); ctx.stroke();
  ctx.textAlign = "center";
  items.forEach((it, i) => {
    const cx = pad + slot * i + slot / 2;
    const bh = (it.v / max) * (h - T - B);
    ctx.fillStyle = i === highlight ? CH.black : CH.light;
    ctx.beginPath(); ctx.roundRect(cx - bw / 2, h - B - Math.max(bh, it.v ? 2 : 0), bw, Math.max(bh, it.v ? 2 : 0), [4, 4, 0, 0]); ctx.fill();
    if (it.v) {
      ctx.fillStyle = i === highlight ? CH.black : CH.mid;
      ctx.font = `${i === highlight ? "bold " : ""}10px sans-serif`;
      ctx.fillText(compact(it.v), cx, h - B - bh - 5);
    }
    ctx.fillStyle = i === highlight ? CH.black : CH.muted;
    ctx.font = `${i === highlight ? "bold " : ""}11px sans-serif`;
    ctx.fillText(it.label, cx, h - 6);
  });
  ctx.textAlign = "left";
}

function arcRing(ctx, cx, cy, r, th, a0, a1, color) {
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1);
  ctx.strokeStyle = color; ctx.lineWidth = th; ctx.lineCap = "butt"; ctx.stroke();
}
function centerText(ctx, cx, cy, main, sub) {
  ctx.textAlign = "center";
  ctx.fillStyle = CH.black; ctx.font = "bold 18px sans-serif";
  ctx.fillText(main, cx, sub ? cy : cy + 6);
  if (sub) { ctx.fillStyle = CH.muted; ctx.font = "11px sans-serif"; ctx.fillText(sub, cx, cy + 16); }
  ctx.textAlign = "left";
}

function drawDonut(cv, items, main, sub) {
  const p = prepare(cv); if (!p) return;
  const { ctx, w, h } = p;
  const cx = w / 2, cy = h / 2, th = 22, r = Math.min(w, h) / 2 - th / 2 - 2;
  const total = sum(items, (i) => i.v);
  if (!total) arcRing(ctx, cx, cy, r, th, 0, Math.PI * 2, CH.border);
  else {
    let a = -Math.PI / 2;
    items.forEach((it, i) => {
      const span = (it.v / total) * Math.PI * 2, gap = items.length > 1 ? 0.03 : 0;
      arcRing(ctx, cx, cy, r, th, a + gap, a + span - gap, SHADES[Math.min(i, SHADES.length - 1)]);
      a += span;
    });
  }
  centerText(ctx, cx, cy - (sub ? 4 : 0), main, sub);
}

function drawRing(cv, ratio, main, sub) {
  const p = prepare(cv); if (!p) return;
  const { ctx, w, h } = p;
  const cx = w / 2, cy = h / 2, th = 12, r = Math.min(w, h) / 2 - th / 2 - 1;
  arcRing(ctx, cx, cy, r, th, 0, Math.PI * 2, CH.border);
  if (ratio > 0) {
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(ratio, 1));
    ctx.strokeStyle = CH.black; ctx.lineWidth = th; ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.fillStyle = CH.black; ctx.font = `bold ${w < 110 ? 15 : 18}px sans-serif`;
  ctx.fillText(main, cx, cy + (sub ? -1 : 6));
  if (sub) { ctx.fillStyle = CH.muted; ctx.font = "10px sans-serif"; ctx.fillText(sub, cx, cy + 14); }
  ctx.textAlign = "left";
}

// rows: [{t, s(フォントサイズ), b(太字), c(色), h(行の高さ), line(区切り線)}]
function renderRowsToImage(rows, filename) {
  const W = 800, pad = 40;
  const H = pad * 2 + rows.reduce((a, r) => a + (r.h || 28), 0);
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle";
  let y = pad;
  for (const r of rows) {
    const h = r.h || 28;
    if (r.line) {
      ctx.fillStyle = "#e9e9e7";
      ctx.fillRect(pad, y + h / 2, W - pad * 2, 1);
    } else if (r.t) {
      ctx.fillStyle = r.c || "#191919";
      ctx.font = `${r.b ? "bold " : ""}${r.s || 16}px sans-serif`;
      ctx.fillText(r.t, pad, y + h / 2, W - pad * 2);
    }
    y += h;
  }
  cv.toBlob((blob) => saveFile(blob, filename));
}
