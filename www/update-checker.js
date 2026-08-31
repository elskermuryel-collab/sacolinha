// Verifica se existe uma versão mais nova do app publicada no GitHub
// e mostra um POP-UP perguntando se a pessoa quer atualizar agora.
//
// Fluxo:
//   1) Toda vez que o app abre (ou volta de segundo plano), checa a versão.
//   2) Se tiver versão nova, mostra o pop-up "Sim, atualizar" / "Agora não".
//   3) Se clicar "Sim", começa o download do APK novo automaticamente.
//      Quando o download terminar, o Android avisa e a pessoa só precisa
//      tocar na notificação (ou no arquivo baixado) pra instalar.
//   4) Se clicar "Agora não", o pop-up não aparece de novo até a pessoa
//      fechar e abrir o app outra vez (mas continua avisando toda vez que
//      abrir, enquanto a versão instalada estiver desatualizada).
(function () {
  // ATENÇÃO: troque "elskermuryel-collab/sacolinha" se o nome de usuário
  // ou do repositório no GitHub mudar no futuro.
  var REPO = "elskermuryel-collab/sacolinha";

  var APK_URL = "https://github.com/" + REPO + "/releases/latest/download/app-debug.apk";
  var VERSION_URL = "https://github.com/" + REPO + "/releases/latest/download/version.txt";

  // Tempo mínimo entre checagens de verdade na internet (evita gastar
  // dados/sinal do mercado se a pessoa ficar abrindo e fechando o app
  // muito rápido). Isso NÃO impede o pop-up de aparecer de novo — só
  // evita bater no GitHub toda hora.
  var THROTTLE_MS = 2 * 60 * 1000; // 2 minutos

  // Usa sessionStorage (não localStorage) de propósito: assim, quando a
  // pessoa fecha o app de vez e abre outra vez, esquece que ela já tinha
  // clicado "Agora não" e volta a perguntar — exatamente como pedido.
  function jaFechouNessaSessao(versao) {
    try { return sessionStorage.getItem("update_dismissed_session") === versao; } catch (e) { return false; }
  }
  function marcarFechadoNessaSessao(versao) {
    try { sessionStorage.setItem("update_dismissed_session", versao); } catch (e) {}
  }
  function baixandoNessaSessao() {
    try { return sessionStorage.getItem("update_downloading") === "1"; } catch (e) { return false; }
  }
  function marcarBaixando() {
    try { sessionStorage.setItem("update_downloading", "1"); } catch (e) {}
  }

  function removerPopup() {
    var existente = document.getElementById("update-popup-overlay");
    if (existente) existente.remove();
  }

  function mostrarPopup(newVersion) {
    if (document.getElementById("update-popup-overlay")) return;
    if (jaFechouNessaSessao(newVersion) || baixandoNessaSessao()) return;

    var overlay = document.createElement("div");
    overlay.id = "update-popup-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);" +
      "display:flex;align-items:center;justify-content:center;padding:20px;" +
      "font-family:sans-serif;";

    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:340px;width:100%;' +
      'padding:22px 20px;box-shadow:0 10px 30px rgba(0,0,0,.3);text-align:center;">' +
        '<div style="font-size:34px;margin-bottom:8px;">🔄</div>' +
        '<div style="font-size:17px;font-weight:bold;color:#1F4436;margin-bottom:8px;">' +
          'Atualização disponível!' +
        '</div>' +
        '<div id="update-popup-msg" style="font-size:14px;color:#444;margin-bottom:18px;line-height:1.4;">' +
          'Tem uma versão nova do Sacolinha. Quer atualizar agora?' +
        '</div>' +
        '<div style="display:flex;gap:10px;">' +
          '<button id="update-popup-nao" style="flex:1;background:#eee;color:#333;border:none;' +
          'border-radius:8px;padding:12px 10px;font-weight:bold;font-size:14px;">Agora não</button>' +
          '<button id="update-popup-sim" style="flex:1;background:#2563eb;color:#fff;border:none;' +
          'border-radius:8px;padding:12px 10px;font-weight:bold;font-size:14px;">Sim, atualizar</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById("update-popup-sim").addEventListener("click", function () {
      marcarBaixando();

      var msg = document.getElementById("update-popup-msg");
      var botoes = overlay.querySelector("div > div:last-child");
      if (botoes) botoes.remove();
      if (msg) {
        msg.innerHTML = 'Baixando a atualização... ⬇️';
      }

      baixarEAbrirInstalador(msg);
    });

    document.getElementById("update-popup-nao").addEventListener("click", function () {
      marcarFechadoNessaSessao(newVersion);
      removerPopup();
    });
  }

  // Baixa o APK novo dentro do proprio app e abre a tela de instalacao do
  // Android sozinho (sem passar pelo navegador nem por notificacao).
  // Se por qualquer motivo isso nao for possivel (ex.: rodando num celular
  // muito antigo, ou algo no plugin falhar), cai de volta no jeito antigo
  // (abrir o link no navegador) pra nunca deixar a pessoa sem conseguir
  // atualizar.
  function baixarEAbrirInstalador(msgEl) {
    function usarNavegadorComoAlternativa(motivo) {
      window.open(APK_URL, "_blank");
      if (msgEl) {
        msgEl.innerHTML =
          'Abrindo o download no navegador... ⬇️<br><br>' +
          'Quando terminar, toque na notificação para instalar.';
      }
      setTimeout(removerPopup, 6000);
    }

    try {
      var Capacitor = window.Capacitor;
      if (!Capacitor || !Capacitor.isNativePlatform || !Capacitor.isNativePlatform()) {
        // Rodando no navegador normal (não é o app instalado no celular).
        return usarNavegadorComoAlternativa("nao-nativo");
      }

      var Filesystem = Capacitor.Plugins && Capacitor.Plugins.Filesystem;
      var FileTransfer = Capacitor.Plugins && Capacitor.Plugins.FileTransfer;
      var FileOpener = Capacitor.Plugins && Capacitor.Plugins.FileOpener;

      if (!Filesystem || !FileTransfer || !FileOpener) {
        return usarNavegadorComoAlternativa("plugin-ausente");
      }

      Filesystem.getUri({ directory: "CACHE", path: "sacolinha-atualizacao.apk" })
        .then(function (destino) {
          return FileTransfer.downloadFile({
            url: APK_URL,
            path: destino.uri,
            progress: true
          }).then(function () {
            return FileOpener.openFile({
              path: destino.uri,
              mimeType: "application/vnd.android.package-archive"
            });
          });
        })
        .then(function () {
          if (msgEl) {
            msgEl.innerHTML =
              'Prontinho! ✅<br><br>Agora é só tocar em "Instalar" na tela que o Android abriu.';
          }
          setTimeout(removerPopup, 6000);
        })
        .catch(function () {
          usarNavegadorComoAlternativa("erro-download");
        });
    } catch (e) {
      usarNavegadorComoAlternativa("excecao");
    }
  }

  function checkForUpdate(forcar) {
    var lastCheck = 0;
    try { lastCheck = parseInt(sessionStorage.getItem('update_last_check') || '0', 10); } catch (e) {}
    if (!forcar && Date.now() - lastCheck < THROTTLE_MS) return;
    try { sessionStorage.setItem('update_last_check', String(Date.now())); } catch (e) {}

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

            if (remoteVersion !== localVersion) {
              mostrarPopup(remoteVersion);
            }
          })
          .catch(function () {});
      })
      .catch(function () {});
  }

  function start() {
    // Checa logo que o app abre.
    setTimeout(function () { checkForUpdate(true); }, 1000);
  }

  // Checa de novo toda vez que o app volta pra frente (a pessoa saiu e
  // voltou, trocou de aplicativo e retornou, etc.) — é o "quando a pessoa
  // entra" no app.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      checkForUpdate(false);
    }
  });
  window.addEventListener("focus", function () {
    checkForUpdate(false);
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();
