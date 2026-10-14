// アプリ化(PWA)の補助: サービスワーカー登録とインストール案内。
// file:// やアーティファクト内ではサービスワーカーが使えないので、何もしない。
(() => {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const panel = document.getElementById("install-panel");
  const btn = document.getElementById("install-btn");
  const msg = document.getElementById("install-msg");
  const web = /^https?:$/.test(location.protocol);

  if (web && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  if (!panel || !web || window.top !== window.self) return; // アーティファクトなどの埋め込み表示では案内しない

  if (standalone) { panel.hidden = false; msg.textContent = "アプリとして起動しています。オフラインでも記録できます。"; return; }
  panel.hidden = false;

  // iPhone/iPad は自動のインストール画面が無いので、手順を案内する
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  msg.textContent = ios
    ? "Safariの共有ボタン(□↑)から「ホーム画面に追加」を選ぶと、アプリとして使えます。"
    : "ブラウザのメニューの「アプリをインストール」または「ホーム画面に追加」から、アプリとして使えます。";

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
    msg.textContent = "ホーム画面に追加すると、アプリのように起動でき、オフラインでも記録できます。";
  });
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    btn.hidden = true;
  });
  window.addEventListener("appinstalled", () => { btn.hidden = true; msg.textContent = "インストールしました。ホーム画面から開いてください。"; });
})();
