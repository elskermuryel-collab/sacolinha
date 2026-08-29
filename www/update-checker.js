// Verifica se existe uma versão mais nova do app publicada no GitHub
// e mostra uma faixa na tela pedindo para atualizar.
(function () {
  // ATENÇÃO: troque "elskermuryel-collab/sacolinha" se o nome de usuário
  // ou do repositório no GitHub mudar no futuro.
  var REPO = "elskermuryel-collab/sacolinha";

  var APK_URL = "https://github.com/" + REPO + "/releases/latest/download/app-debug.apk";
  var VERSION_URL = "https://github.com/" + REPO + "/releases/latest/download/version.txt";

  function showBanner(newVersion) {
    if (document.getElementById("update-banner")) return;

    var banner = document.createElement("div");
    banner.id = "update-banner";
    banner.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:99999;" +
      "background:#2563eb;color:#fff;padding:14px 16px;" +
      "display:flex;align-items:center;justify-content:space-between;gap:10px;" +
      "font-family:sans-serif;box-shadow:0 -2px 10px rgba(0,0,0,.25);";

    banner.innerHTML =
      '<span style="font-size:14px;flex:1;">Nova versão disponível!</span>' +
      '<button id="update-btn" style="background:#fff;color:#2563eb;border:none;' +
      'border-radius:6px;padding:8px 14px;font-weight:bold;font-size:14px;">Atualizar</button>' +
      '<button id="update-dismiss" aria-label="Fechar" style="background:transparent;' +
      'color:#fff;border:none;font-size:20px;line-height:1;padding:4px 8px;">×</button>';

    document.body.appendChild(banner);

    document.getElementById("update-btn").addEventListener("click", function () {
      // Abre o link em navegador externo. O Capacitor abre automaticamente
      // links de fora do app no navegador do sistema (Chrome).
      window.open(APK_URL, "_blank");
    });

    document.getElementById("update-dismiss").addEventListener("click", function () {
      banner.remove();
      try {
        localStorage.setItem("update_dismissed_version", newVersion);
      } catch (e) {}
    });
  }

  function checkForUpdate() {
    fetch("version.txt", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (localVersion) {
        if (!localVersion) return;
        localVersion = localVersion.trim();

        fetch(VERSION_URL, { cache: "no-store" })
          .then(function (r) { return r.ok ? r.text() : null; })
          .then(function (remoteVersion) {
            if (!remoteVersion) return;
            remoteVersion = remoteVersion.trim();

            var dismissed = null;
            try {
              dismissed = localStorage.getItem("update_dismissed_version");
            } catch (e) {}

            if (remoteVersion !== localVersion && remoteVersion !== dismissed) {
              showBanner(remoteVersion);
            }
          })
          .catch(function () {});
      })
      .catch(function () {});
  }

  function start() {
    setTimeout(checkForUpdate, 1000);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
