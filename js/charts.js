// canvas 描画(折れ線グラフ・画像出力)

function drawLine(canvas, pts, unit) {
  const ctx = canvas.getContext("2d");
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#9b9a97";
  ctx.font = "13px sans-serif";
  if (pts.length < 2) {
    ctx.fillText("グラフにはデータが2件以上必要です", 20, H / 2);
    return;
  }
  const vs = pts.map((p) => p.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;
  const x = (i) => 50 + (i / (pts.length - 1)) * (W - 80);
  const y = (v) => H - 30 - ((v - min) / (max - min)) * (H - 55);

  ctx.strokeStyle = "#e9e9e7";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    ctx.beginPath(); ctx.moveTo(50, y(v)); ctx.lineTo(W - 30, y(v)); ctx.stroke();
    ctx.fillText(round(v).toString(), 6, y(v) + 4);
  }
  ctx.strokeStyle = "#191919";
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v))));
  ctx.stroke();
  ctx.fillStyle = "#191919";
  pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(x(i), y(p.v), 3, 0, 7); ctx.fill(); });
  ctx.fillStyle = "#9b9a97";
  ctx.fillText(pts[0].date, 50, H - 8);
  ctx.fillText(pts[pts.length - 1].date, W - 110, H - 8);
  ctx.fillText(unit, W - 30 - ctx.measureText(unit).width, 14);
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
  cv.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
