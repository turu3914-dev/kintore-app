// アプリアイコン(黒地に白のダンベル)を PNG で生成する。外部ライブラリ不要。
//   node tools/make-icons.js
const fs = require("fs");
const zlib = require("zlib");

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// 単位正方形(0..1)上の図形。角丸の長方形
const rrect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const dumbbell = (x, y) =>
  rrect(x, y, 0.22, 0.465, 0.78, 0.535, 0.02) ||          // バー
  rrect(x, y, 0.27, 0.30, 0.355, 0.70, 0.025) ||          // 内側のプレート
  rrect(x, y, 0.645, 0.30, 0.73, 0.70, 0.025) ||
  rrect(x, y, 0.175, 0.385, 0.255, 0.615, 0.022) ||       // 外側のプレート
  rrect(x, y, 0.745, 0.385, 0.825, 0.615, 0.022);

// rounded: 角を透明にする(通常アイコン) / false: 全面を塗る(maskable・iOS)
function render(size, rounded) {
  const buf = Buffer.alloc(size * size * 4), SS = 3;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let bg = 0, fg = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
      if (!rounded || rrect(x, y, 0, 0, 1, 1, 0.22)) { bg++; if (dumbbell(x, y)) fg++; }
    }
    const n = SS * SS, a = bg / n, w = fg / bg || 0; // w: 背景のうち白の割合
    const v = Math.round(25 + (255 - 25) * w); // 黒(#191919) → 白
    buf.set([v, v, v, Math.round(a * 255)], (py * size + px) * 4);
  }
  return png(size, buf);
}

const out = { "icon-192.png": [192, true], "icon-512.png": [512, true], "icon-maskable-512.png": [512, false], "apple-touch-icon.png": [180, false] };
for (const [name, [size, rounded]] of Object.entries(out)) fs.writeFileSync("icons/" + name, render(size, rounded));
console.log("icons:", Object.keys(out).join(", "));
