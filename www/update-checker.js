/*
 * Atualização interna da Sacolinha via PWA/Cache Storage.
 *
 * Não existe download de APK neste fluxo. O valor abaixo acompanha o
 * www/version.txt que foi empacotado com esta versão do app.
 */
(function () {
  var REPO = 'elskermuryel-collab/sacolinha';
  var VERSION_URL = 'https://github.com/' + REPO + '/releases/latest/download/version.txt';
  var THROTTLE_MS = 2 * 60 * 1000;
  var CURRENT_VERSION =
    (document.querySelector('meta[name="app-version"]') || {}).content || '17';
  var pendingVersion = null;
  var preparingPromise = null;
  var applying = false;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function readSession(key, fallback) {
    try {
      var value = sessionStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function writeSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) {}
  }

  function isNewer(remote, local) {
    var r = String(remote || '').trim();
    var l = String(local || '').trim();
    var rn = parseFloat(r.replace(/^v/i, ''));
    var ln = parseFloat(l.replace(/^v/i, ''));

    if (!isNaN(rn) && !isNaN(ln)) return rn > ln;
    return r !== l;
  }

  function removeBanner() {
    var banner = document.getElementById('sacolinha-update-banner');
    if (banner) banner.remove();
  }

  function setSettingsStatus(text, isError) {
    var status = document.getElementById('sacolinha-update-status');
    if (!status) return;
    status.textContent = text;
    status.style.color = isError ? 'var(--danger)' : 'var(--ink-soft)';
  }

  function setButtonUpdating(button, updating) {
    if (!button) return;
    button.disabled = updating;
    button.innerHTML = updating
      ? '<span class="sacolinha-spinner" aria-hidden="true"></span> Atualizando...'
      : 'Aplicar atualização';
  }

  function showBanner(version) {
    pendingVersion = version;
    if (document.getElementById('sacolinha-update-banner')) return;

    var banner = document.createElement('section');
    banner.id = 'sacolinha-update-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText =
      'position:fixed;left:14px;right:14px;top:calc(12px + env(safe-area-inset-top));' +
      'z-index:99998;background:var(--panel,#fff);color:var(--ink,#1b2b22);' +
      'border:1px solid var(--line,#e2d9be);border-radius:16px;padding:13px 14px;' +
      'box-shadow:0 12px 32px rgba(27,43,34,.22);display:flex;align-items:center;' +
      'gap:12px;font:700 13px/1.35 Manrope,system-ui,sans-serif;';

    banner.innerHTML =
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-weight:800;color:var(--primary,#1f4436);">' +
          'Nova versão disponível! Clique para aplicar' +
        '</div>' +
        '<div id="sacolinha-update-status" style="font-size:11px;margin-top:3px;color:var(--ink-soft,#5b6b60);">' +
          'Os arquivos estão sendo preparados em segundo plano.' +
        '</div>' +
      '</div>' +
      '<button id="sacolinha-update-apply" type="button" style="' +
        'border:0;border-radius:12px;padding:10px 12px;background:var(--accent,#e3a72b);' +
        'color:var(--accent-ink,#3a2a05);font:800 12px Manrope,system-ui,sans-serif;' +
        'white-space:nowrap;cursor:pointer;">Aplicar atualização</button>';

    document.body.appendChild(banner);
    document.getElementById('sacolinha-update-apply').addEventListener('click', function () {
      applyUpdate(version);
    });
  }

  function notifyBeforeReload() {
    try {
      window.dispatchEvent(new CustomEvent('sacolinha:before-update'));
    } catch (e) {}
    if (window.SacolinhaDraft && typeof window.SacolinhaDraft.save === 'function') {
      try { window.SacolinhaDraft.save(); } catch (e) {}
    }
  }

  async function getRegistration() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      var registration = await navigator.serviceWorker.getRegistration();
      if (!registration &&
          (location.protocol === 'https:' || location.hostname === 'localhost')) {
        registration = await navigator.serviceWorker.register('service-worker.js');
      }
      return registration;
    } catch (e) {
      return null;
    }
  }

  function sendWorkerMessage(worker, message, timeoutMs) {
    return new Promise(function (resolve) {
      if (!worker) {
        resolve(false);
        return;
      }

      var finished = false;
      var channel = new MessageChannel();
      var timer = setTimeout(function () {
        if (finished) return;
        finished = true;
        resolve(false);
      }, timeoutMs || 3500);

      channel.port1.onmessage = function (event) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve(!!(event.data && event.data.ok));
      };

      try {
        worker.postMessage(message, [channel.port2]);
      } catch (e) {
        clearTimeout(timer);
        finished = true;
        resolve(false);
      }
    });
  }

  async function prepareCache(version) {
    if (preparingPromise) return preparingPromise;

    preparingPromise = (async function () {
      var registration = await getRegistration();
      if (!registration) return false;

      var active = navigator.serviceWorker.controller || registration.active;
      var refreshed = await sendWorkerMessage(
        active,
        { type: 'FORCE_UPDATE', version: version },
        3500
      );

      /*
       * Também pede ao navegador para buscar uma nova versão do próprio
       * service-worker.js. Isso é importante para quem ainda estava usando
       * um worker antigo, anterior ao fluxo sem APK.
       */
      try { await registration.update(); } catch (e) {}
      return refreshed || !!registration.active || !!registration.waiting;
    })().finally(function () {
      preparingPromise = null;
    });

    return preparingPromise;
  }

  async function applyUpdate(version) {
    if (applying) return;
    applying = true;

    var button = document.getElementById('sacolinha-update-apply');
    var status = document.getElementById('sacolinha-update-status');
    setButtonUpdating(button, true);
    if (status) status.textContent = 'Salvando seu rascunho e aplicando os arquivos novos...';
    notifyBeforeReload();

    try {
      await prepareCache(version);
      await sleep(500);
      removeBanner();
      window.location.reload();
    } catch (e) {
      applying = false;
      setButtonUpdating(button, false);
      if (status) status.textContent = 'Não consegui atualizar agora. Tente novamente.';
      setSettingsStatus('Não foi possível aplicar a atualização.', true);
    }
  }

  async function fetchRemoteVersion() {
    var separator = VERSION_URL.indexOf('?') >= 0 ? '&' : '?';
    var response = await fetch(
      VERSION_URL + separator + 'check=' + Date.now(),
      { cache: 'no-store' }
    );
    if (!response.ok) return null;
    var version = (await response.text()).trim();
    return version || null;
  }

  async function checkForUpdate(force, options) {
    options = options || {};
    var lastCheck = parseInt(readSession('sacolinha_update_last_check', '0'), 10) || 0;
    if (!force && Date.now() - lastCheck < THROTTLE_MS) return null;
    writeSession('sacolinha_update_last_check', String(Date.now()));

    try {
      var remoteVersion = await fetchRemoteVersion();
      if (!remoteVersion) {
        if (options.manual) setSettingsStatus('Não foi possível checar agora.', true);
        return null;
      }

      if (isNewer(remoteVersion, CURRENT_VERSION)) {
        showBanner(remoteVersion);
        setSettingsStatus('Atualização encontrada. Preparando o cache...', false);
        prepareCache(remoteVersion).then(function () {
          var status = document.getElementById('sacolinha-update-status');
          if (status) {
            status.textContent =
              'Pronto para aplicar. Seu rascunho será salvo antes de recarregar.';
          }
        });
        return remoteVersion;
      }

      if (options.manual) setSettingsStatus('Você já está usando a versão mais recente.', false);
      return false;
    } catch (e) {
      if (options.manual) setSettingsStatus('Não foi possível checar agora.', true);
      return null;
    }
  }

  function ensureSettingsUI() {
    var actions = document.querySelector('.header-actions');
    if (!actions || document.getElementById('sacolinha-settings-button')) return;

    var settingsButton = document.createElement('button');
    settingsButton.className = 'mini-btn';
    settingsButton.id = 'sacolinha-settings-button';
    settingsButton.type = 'button';
    settingsButton.title = 'Configurações';
    settingsButton.setAttribute('aria-label', 'Configurações');
    settingsButton.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/>' +
      '<path d="m19.4 15 .1.1a1.9 1.9 0 0 1-2.7 2.7l-.1-.1a1.9 1.9 0 0 0-3.2 1.4v.2a1.9 1.9 0 0 1-3.8 0v-.2a1.9 1.9 0 0 0-3.2-1.4l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.9 1.9 0 0 0-1.4-3.2h-.2a1.9 1.9 0 0 1 0-3.8h.2a1.9 1.9 0 0 0 1.4-3.2l-.1-.1A1.9 1.9 0 1 1 6.5 2l.1.1a1.9 1.9 0 0 0 3.2-1.4V.5a1.9 1.9 0 0 1 3.8 0v.2a1.9 1.9 0 0 0 3.2 1.4l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.9 1.9 0 0 0 1.4 3.2h.2a1.9 1.9 0 0 1 0 3.8h-.2a1.9 1.9 0 0 0-1.4 3.2Z"/>' +
      '</svg><span class="mini-label">Configurações</span>';
    actions.appendChild(settingsButton);

    var overlay = document.createElement('div');
    overlay.id = 'sacolinha-settings-overlay';
    overlay.style.cssText =
      'display:none;position:fixed;inset:0;z-index:99997;background:rgba(10,15,12,.55);' +
      'align-items:center;justify-content:center;padding:20px;font-family:Manrope,system-ui,sans-serif;';
    overlay.innerHTML =
      '<div style="width:min(390px,100%);background:var(--panel,#fff);color:var(--ink,#1b2b22);' +
      'border:1px solid var(--line,#e2d9be);border-radius:20px;padding:22px;box-shadow:0 20px 50px rgba(27,43,34,.3);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
          '<h2 style="margin:0;color:var(--primary,#1f4436);font:800 22px Fraunces,Georgia,serif;">Configurações</h2>' +
          '<button id="sacolinha-settings-close" type="button" aria-label="Fechar" style="' +
            'border:0;border-radius:50%;width:32px;height:32px;background:var(--line-soft,#eee7d3);' +
            'color:var(--ink-soft,#5b6b60);font-size:18px;cursor:pointer;">✕</button>' +
        '</div>' +
        '<p style="margin:8px 0 18px;color:var(--ink-soft,#5b6b60);font-size:13px;line-height:1.5;">' +
          'O app usa internet por padrão para sincronizar e verificar novidades. Você pode desligar o modo online no cabeçalho.' +
        '</p>' +
        '<button id="sacolinha-manual-update" type="button" style="' +
          'width:100%;border:0;border-radius:14px;padding:13px 14px;background:var(--accent,#e3a72b);' +
          'color:var(--accent-ink,#3a2a05);font:800 14px Manrope,system-ui,sans-serif;cursor:pointer;">' +
          'Verificar novas atualizações</button>' +
        '<p id="sacolinha-update-status" style="min-height:18px;margin:12px 2px 0;color:var(--ink-soft,#5b6b60);font-size:12px;line-height:1.4;"></p>' +
      '</div>';
    document.body.appendChild(overlay);

    function closeSettings() { overlay.style.display = 'none'; }
    settingsButton.addEventListener('click', function () { overlay.style.display = 'flex'; });
    document.getElementById('sacolinha-settings-close').addEventListener('click', closeSettings);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeSettings();
    });
    document.getElementById('sacolinha-manual-update').addEventListener('click', async function () {
      var button = this;
      button.disabled = true;
      button.innerHTML = '<span class="sacolinha-spinner" aria-hidden="true"></span> Verificando...';
      await checkForUpdate(true, { manual: true });
      button.disabled = false;
      button.textContent = 'Verificar novas atualizações';
    });
  }

  function injectStyles() {
    if (document.getElementById('sacolinha-update-styles')) return;
    var style = document.createElement('style');
    style.id = 'sacolinha-update-styles';
    style.textContent =
      '@keyframes sacolinha-spin{to{transform:rotate(360deg)}}' +
      '.sacolinha-spinner{display:inline-block;width:13px;height:13px;border:2px solid currentColor;' +
      'border-right-color:transparent;border-radius:50%;vertical-align:-2px;' +
      'animation:sacolinha-spin .7s linear infinite;margin-right:5px}' +
      '#sacolinha-update-apply:disabled,#sacolinha-manual-update:disabled{opacity:.7;cursor:wait}';
    document.head.appendChild(style);
  }

  function start() {
    injectStyles();
    ensureSettingsUI();
    setTimeout(function () { checkForUpdate(false); }, 900);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkForUpdate(false);
  });
  window.addEventListener('focus', function () { checkForUpdate(false); });
  window.addEventListener('pageshow', function () { checkForUpdate(false); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
