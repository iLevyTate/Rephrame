(function(){
  const isFileProtocol = location.protocol === 'file:';
  // Whether a SW was already controlling this page when it loaded. On the
  // first-ever visit this is false: the new worker's clients.claim() fires
  // controllerchange, but there's no older app version to refresh away from,
  // so we must NOT reload then (it would be a jarring spurious reload that
  // can interrupt an in-progress action). Genuine updates always have a
  // prior controller, so this stays true for them.
  const _hadControllerAtStartup = ('serviceWorker' in navigator) && !!navigator.serviceWorker.controller;

  // Inline fallback icon for file:// where the manifest can't fetch external
  // PNGs/SVGs. Matches icons/icon-512.svg exactly — same italic Fraunces r,
  // copper gradient, framing rule with ball-terminal caps.
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="78%">
        <stop offset="0%" stop-color="#2a221d"/>
        <stop offset="55%" stop-color="#1d1916"/>
        <stop offset="100%" stop-color="#120f0e"/>
      </radialGradient>
      <linearGradient id="mark" gradientUnits="userSpaceOnUse" x1="100" y1="80" x2="430" y2="420">
        <stop offset="0%" stop-color="#e9885a"/>
        <stop offset="42%" stop-color="#c46838"/>
        <stop offset="78%" stop-color="#a14d24"/>
        <stop offset="100%" stop-color="#7a3a1a"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="96" ry="96" fill="url(#bg)"/>
    <circle cx="170" cy="170" r="180" fill="#b8552c" opacity="0.06"/>
    <text x="262" y="368" font-family="Fraunces,Georgia,serif" font-size="340" font-weight="500" font-style="italic" fill="url(#mark)" text-anchor="middle" letter-spacing="-6">r</text>
    <line x1="166" y1="404" x2="346" y2="404" stroke="url(#mark)" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
    <circle cx="166" cy="404" r="3.5" fill="#b8552c" opacity="0.9"/>
    <circle cx="346" cy="404" r="3.5" fill="#b8552c" opacity="0.9"/>
  </svg>`;
  const iconUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSvg);

  // On file://, swap in inline manifest + icons so install still works without
  // a web server. Same trick OdTauLai uses.
  if (isFileProtocol) {
    const appleEl = document.getElementById('pwa-apple-icon');
    if (appleEl) appleEl.href = iconUrl;
    const favEl = document.getElementById('pwa-favicon');
    if (favEl) favEl.href = iconUrl;
    const manifest = {
      name: 'Rephrame — A Private CBT Journal',
      short_name: 'Rephrame',
      description: 'Private, offline-first CBT journal. All data stays on your device.',
      start_url: location.pathname.split('/').slice(0,-1).join('/') + '/' + (location.pathname.split('/').pop() || ''),
      scope: location.pathname.split('/').slice(0,-1).join('/') + '/',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'any',
      background_color: '#1a1715',
      theme_color: '#1a1715',
      categories: ['health', 'lifestyle', 'productivity'],
      icons: [
        {src: iconUrl, sizes: '192x192', type: 'image/svg+xml', purpose: 'any'},
        {src: iconUrl, sizes: '512x512', type: 'image/svg+xml', purpose: 'any'},
        {src: iconUrl, sizes: 'any',     type: 'image/svg+xml', purpose: 'maskable'}
      ]
    };
    try {
      const manifestBlob = new Blob([JSON.stringify(manifest)], {type: 'application/manifest+json'});
      const manifestEl = document.getElementById('pwa-manifest');
      if (manifestEl) manifestEl.href = URL.createObjectURL(manifestBlob);
    } catch(_) {}
  }

  // Listen for SW precache-incomplete reports so we can warn the user that
  // offline mode may be partial rather than failing silently.
  try{
    const swStatusCh = new BroadcastChannel('reframe-sw-status');
    swStatusCh.addEventListener('message', (ev) => {
      if(!ev.data || ev.data.type !== 'precache-incomplete') return;
      const failed = Array.isArray(ev.data.failed) ? ev.data.failed : [];
      if(!failed.length) return;
      let banner = document.getElementById('swPrecacheBanner');
      if(!banner){
        banner = document.createElement('div');
        banner.id = 'swPrecacheBanner';
        banner.className = 'sw-precache-banner';
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;z-index:9999;background:#2a2521;color:#f5efe6;border:1px solid #b8552c;border-radius:8px;padding:12px 14px;font:14px/1.4 system-ui,sans-serif;display:flex;gap:12px;align-items:center;flex-wrap:wrap;box-shadow:0 12px 36px rgba(0,0,0,0.48);';
        document.body.appendChild(banner);
      }
      banner.replaceChildren();
      const msg = document.createElement('span');
      msg.style.flex = '1 1 auto';
      msg.textContent = '⚠ Offline cache incomplete — ' + failed.length + ' of ' + (ev.data.total || '?') + ' assets failed to load. Online use is fine; offline mode may be partial.';
      banner.appendChild(msg);
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.style.cssText = 'background:#b8552c;color:#1a1715;border:none;border-radius:6px;padding:6px 12px;font:inherit;font-weight:600;cursor:pointer;';
      refresh.textContent = 'Reload';
      refresh.onclick = () => location.reload();
      banner.appendChild(refresh);
      const close = document.createElement('button');
      close.type = 'button';
      close.style.cssText = 'background:transparent;color:#c9bdac;border:1px solid #5a4f43;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer;';
      close.textContent = 'Dismiss';
      close.onclick = () => banner.remove();
      banner.appendChild(close);
    });
  }catch(_){ /* BroadcastChannel unavailable */ }

  // Show a "new version is ready" banner when the SW has a waiting worker.
  // Clicking Reload tells the new worker to skip waiting; the controllerchange
  // event then triggers a single full reload so the user gets the new app.
  let _reloadingForUpdate = false;
  // Set when the user explicitly asks for the update (clicks Reload → we post
  // SKIP_WAITING). It lets the controllerchange handler reload even on a
  // first-ever visit, where _hadControllerAtStartup is false but the user
  // genuinely requested the swap.
  let _updateRequested = false;
  function _showUpdateBanner(reg){
    if (document.getElementById('swUpdateBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'swUpdateBanner';
    banner.className = 'sw-update-banner';
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:fixed;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;z-index:9998;max-width:520px;margin:0 auto;background:#221e1b;color:#f5efe6;border:1px solid rgba(184,85,44,0.32);border-left:3px solid #b8552c;border-radius:10px;padding:12px 14px;font:14px/1.5 system-ui,sans-serif;display:flex;gap:10px;align-items:center;flex-wrap:wrap;box-shadow:0 12px 36px rgba(0,0,0,0.48);';
    const text = document.createElement('div');
    text.style.cssText = 'flex:1 1 200px;min-width:0;';
    text.innerHTML = '<strong style="display:block;font-family:Georgia,serif;font-size:15px;color:#b8552c;">A new version is ready.</strong><span style="font-size:13px;color:#c9bdac;">Reload to pick up the latest improvements. Your entries stay where they are.</span>';
    banner.appendChild(text);
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.style.cssText = 'background:#b8552c;color:#1a1715;border:none;border-radius:6px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;';
    reload.textContent = 'Reload';
    reload.onclick = () => {
      if (!reg || !reg.waiting) { location.reload(); return; }
      _updateRequested = true;
      reg.waiting.postMessage({type: 'SKIP_WAITING'});
    };
    banner.appendChild(reload);
    const later = document.createElement('button');
    later.type = 'button';
    later.style.cssText = 'background:transparent;color:#c9bdac;border:1px solid #5a4f43;border-radius:6px;padding:8px 12px;font:inherit;cursor:pointer;';
    later.textContent = 'Later';
    later.onclick = () => banner.remove();
    banner.appendChild(later);
    document.body.appendChild(banner);
  }

  function _watchForUpdate(reg){
    if (!reg) return;
    // If a worker is already installed and waiting at registration time
    // (e.g. user reopened the tab between visits), surface immediately.
    if (reg.waiting && navigator.serviceWorker.controller) _showUpdateBanner(reg);
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          _showUpdateBanner(reg);
        }
      });
    });
    // After SKIP_WAITING resolves, the new worker takes control — that fires
    // controllerchange exactly once. We reload then; the flag guards against
    // browsers that fire it twice (older Firefox).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_reloadingForUpdate) return;
      // First-install claim() (no prior controller) isn't an update — skip the
      // reload so the very first visit doesn't refresh itself out from under
      // the user. But if the user explicitly clicked Reload (SKIP_WAITING),
      // honor it even on a first visit — otherwise their first click is
      // silently swallowed and nothing happens until they click again.
      if (!_hadControllerAtStartup && !_updateRequested) return;
      _reloadingForUpdate = true;
      location.reload();
    });
    // Re-check for updates when the tab comes back into focus. The browser
    // does this periodically on its own (~24h), but on-focus catches the
    // case where the user has left a tab open all week.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(()=>{});
      }
    });
  }

  // Register the service worker. There is deliberately no blob-URL fallback:
  // the SW spec only allows http(s) same-origin script URLs (every browser
  // rejects blob: registrations) and this page's CSP declares
  // `worker-src 'self'`, so an inline fallback can never register. If sw.js
  // fails, say so honestly instead of implying offline support exists.
  if ('serviceWorker' in navigator && !isFileProtocol) {
    navigator.serviceWorker.register('sw.js', {scope: './'}).then((reg)=>{
      window._swRegistered = true;
      window._swReg = reg;
      _watchForUpdate(reg);
    }).catch((err)=>{
      window._swRegistered = false;
      console.warn('Service worker registration failed — offline mode unavailable:', err);
    });
  }

  // File-handler launch (Window Launch Queue API). When the OS opens a
  // .json with Reframe (per manifest's file_handlers), Chromium-class
  // browsers deliver the file via launchQueue. Stash it so the import
  // flow can use it without re-prompting via a file picker. The
  // ?openfile=1 URL path in index.html handles surfacing the import modal.
  if ('launchQueue' in window) {
    try {
      window.launchQueue.setConsumer(async ({ files }) => {
        if (!files || !files.length) return;
        try {
          const file = await files[0].getFile();
          window._reframeLaunchedFile = file;
        } catch (_) { /* permission denied or unreadable */ }
      });
    } catch (_) { /* unsupported */ }
  }

  // Capture beforeinstallprompt so the in-app Install button can fire it later.
  window._deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window._deferredInstallPrompt = e;
    const btn = document.getElementById('installBtn');
    if (btn) btn.hidden = false;
    if (typeof window.refreshPWAInstallUI === 'function') window.refreshPWAInstallUI();
  });
  window.addEventListener('appinstalled', () => {
    window._deferredInstallPrompt = null;
    const btn = document.getElementById('installBtn');
    if (btn) btn.hidden = true;
    const panel = document.getElementById('installHelpPanel');
    if (panel) panel.hidden = true;
  });

  function _isIOS(){
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function _isStandalonePWA(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  // iOS never fires beforeinstallprompt — show a button with manual steps.
  function _syncInstallButtonForPlatform(){
    if (location.protocol === 'file:') return;
    if (_isStandalonePWA()) {
      const btn = document.getElementById('installBtn');
      if (btn) btn.hidden = true;
      return;
    }
    const btn = document.getElementById('installBtn');
    if (!btn) return;
    if (window._deferredInstallPrompt) {
      btn.hidden = false;
      btn.textContent = '＋ Install Rephrame';
      return;
    }
    if (_isIOS()) {
      btn.hidden = false;
      btn.textContent = '＋ Add to Home Screen';
      return;
    }
    if (/Android/i.test(navigator.userAgent)) {
      btn.hidden = false;
      btn.textContent = '＋ Install app';
    }
  }

  function _renderInstallHelpPanel(steps, title){
    const btn = document.getElementById('installBtn');
    if(!btn) return;
    let panel = document.getElementById('installHelpPanel');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'installHelpPanel';
      panel.className = 'install-help-panel';
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', 'How to install');
      panel.style.cssText = 'position:fixed;left:12px;right:12px;bottom:88px;z-index:9999;background:#221e1b;color:#f5efe6;border:1px solid rgba(184,85,44,0.32);border-radius:12px;padding:16px;font:14px/1.5 system-ui,sans-serif;box-shadow:0 12px 36px rgba(0,0,0,0.48);max-width:520px;margin:0 auto;';
      document.body.appendChild(panel);
    }
    if(!panel.hidden && panel.dataset.title === title){
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    panel.dataset.title = title;
    panel.replaceChildren();
    const h = document.createElement('div');
    h.style.cssText = 'font-family:Georgia,serif;font-size:17px;font-weight:600;margin-bottom:10px;color:#b8552c;';
    h.textContent = title;
    panel.appendChild(h);
    const ol = document.createElement('ol');
    ol.style.cssText = 'margin:0 0 12px 0;padding-left:20px;';
    steps.forEach(s => {
      const li = document.createElement('li');
      li.style.cssText = 'margin-bottom:6px;';
      li.textContent = s;
      ol.appendChild(li);
    });
    panel.appendChild(ol);
    const close = document.createElement('button');
    close.type = 'button';
    close.style.cssText = 'background:#b8552c;color:#1a1715;border:none;border-radius:6px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;';
    close.textContent = 'Got it';
    close.onclick = () => { panel.hidden = true; };
    panel.appendChild(close);
  }

  window.installPWA = function(){
    if (window._deferredInstallPrompt) {
      const deferred = window._deferredInstallPrompt;
      deferred.prompt();
      deferred.userChoice.then((choice) => {
        // Only discard the prompt + hide the button when the user actually
        // installed. Chrome doesn't re-fire beforeinstallprompt in the same
        // page load, so nulling it on 'dismissed' would strand a user who
        // cancelled by accident with no way to install for the rest of the
        // session. On dismiss, leave the deferred prompt and button in place.
        if (choice && choice.outcome === 'accepted') {
          window._deferredInstallPrompt = null;
          const btn = document.getElementById('installBtn');
          if (btn) btn.hidden = true;
          const help = document.getElementById('installHelpPanel');
          if (help) help.hidden = true;
        }
      });
      return;
    }
    if (_isIOS()) {
      _renderInstallHelpPanel(
        [
          'Tap the Share button (square with up-arrow) at the bottom of Safari.',
          'Scroll and tap "Add to Home Screen".',
          'Tap Add — Rephrame opens fullscreen like a native app, fully offline.',
          'Note: iOS only exposes Add-to-Home-Screen through Safari. Chrome on iOS uses the same WebKit; if the option is missing, switch to Safari.',
        ],
        'Install on iPhone / iPad'
      );
      return;
    }
    if (/Android/i.test(navigator.userAgent || '')) {
      _renderInstallHelpPanel(
        [
          'Open Chrome\'s menu (⋮ in the top-right).',
          'Tap "Install app" or "Add to Home screen".',
          'If you don\'t see it: the site must be on HTTPS or localhost, and Chrome shows install only after a bit of engagement.',
        ],
        'Install on Android'
      );
      return;
    }
    _renderInstallHelpPanel(
      [
        'In Chrome / Edge, click the ⊕ Install icon in the address bar, or use the menu → Save and share → Install page as app.',
        'The site must be served over HTTPS or localhost (file:// won\'t work for native install on desktop).',
        'On iOS Safari: Share → Add to Home Screen.',
      ],
      'Install Rephrame'
    );
  };

  window.refreshPWAInstallUI = _syncInstallButtonForPlatform;

  // Wire the in-page install button to installPWA() once the DOM is ready.
  // The button is added inert in markup; pwa.js owns its visibility + handler
  // so the rest of the app code stays unaware of install plumbing.
  function _bindInstallBtn(){
    const btn = document.getElementById('installBtn');
    if (!btn || btn.dataset.pwaBound === '1') return;
    btn.dataset.pwaBound = '1';
    btn.addEventListener('click', (e) => { e.preventDefault(); window.installPWA(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _bindInstallBtn(); _syncInstallButtonForPlatform(); });
  } else {
    _bindInstallBtn();
    _syncInstallButtonForPlatform();
  }
  setTimeout(() => { _bindInstallBtn(); _syncInstallButtonForPlatform(); }, 1500);
})();
