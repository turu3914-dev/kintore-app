// index.html の CSS/JS を埋め込んだ単一ファイル demo/kintore-demo.html を生成する
const fs = require("fs");
let html = fs.readFileSync("index.html", "utf8");
html = html.replace(/<link rel="stylesheet" href="(.+?)">/, (_, p) => `<style>\n${fs.readFileSync(p, "utf8")}</style>`);
html = html.replace(/<script src="(.+?)"><\/script>/g, (_, p) => `<script>\n${fs.readFileSync(p, "utf8")}</script>`);
html = html.replace("<script>\n// 計算ロジック", "<script>window.DEMO_AUTOLOAD = true;</script>\n<script>\n// 計算ロジック".replace("// 計算", "// 計算"));
fs.mkdirSync("demo", { recursive: true });
fs.writeFileSync("demo/kintore-demo.html", html);
console.log("written", html.length, "bytes");
