// Claudeアーティファクト用の単一HTML artifact/kintore-artifact.html を生成する。
// サブスクのClaude利用枠で食事写真を解析するため、foodai.js が claude.use("sample") を使う。
const fs = require("fs");
const html = fs.readFileSync("index.html", "utf8");
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script src="(.+?)"><\/script>/g, (_, p) => `<script>\n${fs.readFileSync(p, "utf8")}</script>`);
const out = `<title>筋トレ記録</title>\n<style>\n${fs.readFileSync("css/style.css", "utf8")}</style>\n${body}`;
fs.mkdirSync("artifact", { recursive: true });
fs.writeFileSync("artifact/kintore-artifact.html", out);
console.log("written", out.length, "bytes");
