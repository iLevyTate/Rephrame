// ========== P2P SYNC (WebRTC via PeerJS) ==========
// Devices sync journal entries directly — no server stores your data.
// PeerJS cloud only brokers the initial handshake (SDP/ICE exchange);
// after that, entries flow device-to-device over an RTCDataChannel.
//
// Ported from Odta's sync.js and adapted to Rephrame's data model:
// the unit of sync is the journal entry (state.entries), merged by id
// with last-write-wins on updatedAt||createdAt, plus a deletion-tombstone
// map so a delete on one device isn't resurrected by a stale peer.
//
// Pairing code is displayed as `RFR-XXX-XXX`; the leading "RFR" is brand
// only. The underlying peer id is `rephrame-<6 chars>`.

const SYNC_PEER_KEY = "rephrame_peer_id_v1";
const SYNC_ROOM_KEY = "rephrame_sync_room";
const SYNC_DELS_KEY = "rephrame_entry_dels";
const SYNC_VERSION  = 1;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Crockford-ish, no 0/O/1/I
const CODE_BRAND    = "RFR";

let _peer        = null;   // PeerJS instance
let _conn        = null;   // active DataConnection
let _syncEnabled = false;
let _syncStatus  = "off";  // 'off' | 'loading' | 'waiting' | 'connecting' | 'connected' | 'error'
let _myRoomCode  = null;
let _connectTimeoutId   = null;
let _pendingInboundConn = null;
// Suppress re-broadcast while we're applying a peer's state, so an incoming
// merge → persist() doesn't echo straight back and cause a ping-pong.
let _applyingRemote = false;

// Auto-reconnect: remember the target code, retry with exponential backoff,
// stop after the last attempt so the user can manually Reconnect.
let _lastConnectCode  = null;
let _reconnectAttempt = 0;
let _reconnectTimerId = null;
const SYNC_RECONNECT_BACKOFFS_MS = [2000, 4000, 8000, 16000, 30000];

// ── Helpers ─────────────────────────────────────────────────────────────────

function _clampSyncTs(ts) {
  let n = typeof ts === "number" ? ts : NaN;
  if (!Number.isFinite(n) && ts != null) {
    const p = Date.parse(String(ts));
    n = Number.isFinite(p) ? p : NaN;
  }
  if (!Number.isFinite(n)) return 0;
  const now = Date.now();
  if (n > now + 300000) return now;
  return n;
}

// LWW key for an entry: an edit stamps updatedAt; otherwise fall back to
// createdAt so a once-edited copy beats an untouched one.
function _entryTs(e) {
  if (!e) return 0;
  return _clampSyncTs(e.updatedAt || e.createdAt || 0);
}

function _genPeerId() {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return "rephrame-" + s.toLowerCase();
}

function _friendlySyncError(err) {
  const t = (err && (err.type || err.code)) || "";
  const map = {
    "peer-unavailable":     "Code not found — other device is offline or the code is mistyped.",
    "network":              "Network error — check your internet connection.",
    "server-error":         "Matchmaking server unreachable — retrying.",
    "socket-error":         "Lost connection to matchmaking server — retrying.",
    "socket-closed":        "Matchmaking connection closed — retrying.",
    "disconnected":         "Disconnected from the broker — reconnecting.",
    "browser-incompatible": "Browser does not support WebRTC data channels.",
    "webrtc":               "WebRTC negotiation failed — try Reconnect or pairing again.",
    "unavailable-id":       "Code conflict — generating a new one.",
  };
  if (t && map[t]) return map[t];
  if (err && err.message) return String(err.message);
  return "Connection failed";
}

function _setSyncStatus(status, msg) {
  _syncStatus = status;
  const el  = document.getElementById("syncStatus");
  const dot = document.getElementById("syncDot");
  if (!el) return;
  const peerCode = (status === "connected" && _conn && _conn.peer) ? _idToCode(_conn.peer) : null;
  const labels = {
    off:        "Sync off",
    loading:    "Loading…",
    waiting:    "Waiting for the other device…",
    connecting: "Connecting…",
    connected:  peerCode ? ("Synced with " + peerCode) : "Synced",
    error:      msg || "Error",
  };
  el.textContent = labels[status] || status;
  if (dot) dot.className = "sync-dot sync-dot--" + status;
  // Re-render the action row (Reconnect button visibility) when status flips.
  _renderSyncActionRow();
}

function _normalizeCode(code) {
  let raw = String(code || "").toUpperCase().replace(/[\s-]/g, "");
  if (raw.startsWith(CODE_BRAND)) raw = raw.slice(CODE_BRAND.length);
  return raw;
}

function _codeToId(code) {
  return "rephrame-" + _normalizeCode(code).toLowerCase();
}

function _idToCode(id) {
  const suffix = String(id || "").replace(/^rephrame-/, "").toUpperCase();
  if (suffix.length === 6) return CODE_BRAND + "-" + suffix.slice(0, 3) + "-" + suffix.slice(3);
  const half = Math.ceil(suffix.length / 2);
  return CODE_BRAND + "-" + suffix.slice(0, half) + "-" + suffix.slice(half);
}

function _isValidCode(code) {
  const n = _normalizeCode(code);
  return n.length === 6 && [...n].every(c => CODE_ALPHABET.includes(c));
}

// ── PeerJS loader (vendored, lazy) ───────────────────────────────────────────

function _loadPeerJS() {
  return new Promise((res, rej) => {
    if (window.Peer) return res(window.Peer);
    const s = document.createElement("script");
    s.src = "./js/vendor/peerjs.min.js";
    s.onload  = () => res(window.Peer);
    s.onerror = () => rej(new Error("Failed to load PeerJS from js/vendor/peerjs.min.js"));
    document.head.appendChild(s);
  });
}

// ── Deletion tombstones ──────────────────────────────────────────────────────
// Hard deletes (state.entries.filter) leave no trace, so a union-merge with a
// peer that still has the entry would resurrect it. We record {id: deletedAt}
// and drop any entry whose tombstone is newer than the entry's own timestamp.

function _loadEntryDels() {
  try {
    const raw = JSON.parse(localStorage.getItem(SYNC_DELS_KEY) || "{}");
    return (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
  } catch { return {}; }
}

function _saveEntryDels(map) {
  // Prune tombstones older than 90 days so the map can't grow unbounded.
  const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
  const out = {};
  for (const [id, ts] of Object.entries(map || {})) {
    const n = _clampSyncTs(ts);
    if (n >= cutoff) out[id] = n;
  }
  try { localStorage.setItem(SYNC_DELS_KEY, JSON.stringify(out)); } catch { /* fire-and-forget */ }
  return out;
}

// Called from app.js when an entry is deleted.
function syncRecordEntryDeletion(id) {
  if (!id) return;
  const map = _loadEntryDels();
  map[id] = Date.now();
  _saveEntryDels(map);
  if (typeof syncBroadcast === "function") syncBroadcast();
}

// Called from app.js when a delete is undone, so the restored entry isn't
// re-deleted on the next merge.
function syncClearEntryDeletion(id) {
  if (!id) return;
  const map = _loadEntryDels();
  if (map[id] != null) { delete map[id]; _saveEntryDels(map); }
  if (typeof syncBroadcast === "function") syncBroadcast();
}

function _mergeDelMaps(local, remote) {
  const out = { ...(local || {}) };
  if (remote && typeof remote === "object" && !Array.isArray(remote)) {
    for (const [id, ts] of Object.entries(remote)) {
      const rv = _clampSyncTs(ts);
      out[id] = out[id] == null ? rv : Math.max(_clampSyncTs(out[id]), rv);
    }
  }
  return out;
}

// ── State packaging + merge ──────────────────────────────────────────────────

const _SYNC_MAX_MSG_CHARS = 5_000_000;
const _SYNC_MAX_ENTRIES   = 100_000;

function _packState() {
  return {
    syncV:    SYNC_VERSION,
    sentAt:   Date.now(),
    entries:  (typeof state !== "undefined" && Array.isArray(state.entries)) ? state.entries : [],
    entryDels: _loadEntryDels(),
  };
}

function _payloadInvalid(remote) {
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) return true;
  let n = 0;
  try { n = JSON.stringify(remote).length; } catch { return true; }
  if (n > _SYNC_MAX_MSG_CHARS) return true;
  if (remote.syncV != null && remote.syncV !== SYNC_VERSION) return true;
  if (Array.isArray(remote.entries) && remote.entries.length > _SYNC_MAX_ENTRIES) return true;
  return false;
}

function _mergeState(remote) {
  try {
    if (_payloadInvalid(remote)) {
      console.warn("[sync] rejected oversized or invalid payload");
      return;
    }
    if (typeof state === "undefined" || !Array.isArray(state.entries)) return;

    const norm = (typeof normalizeEntry === "function") ? normalizeEntry : (e => e);

    let dels = _mergeDelMaps(_loadEntryDels(), remote.entryDels);

    const byId = new Map(state.entries.map(e => [e.id, e]));

    // Fold in remote entries (last-write-wins), honoring tombstones.
    for (const re of (remote.entries || [])) {
      if (!re || re.id == null) continue;
      const rt = _entryTs(re);
      const del = dels[re.id];
      if (del != null && _clampSyncTs(del) > rt) continue; // deleted after this version
      const ex = byId.get(re.id);
      if (!ex) { byId.set(re.id, norm(re)); }
      else if (rt > _entryTs(ex)) { byId.set(re.id, norm(re)); }
    }

    // Apply tombstones to whatever we hold locally. If a local copy is newer
    // than its tombstone, the resurrection wins and we drop the tombstone.
    for (const [id, e] of [...byId.entries()]) {
      const del = dels[id];
      if (del == null) continue;
      if (_clampSyncTs(del) > _entryTs(e)) byId.delete(id);
      else delete dels[id];
    }

    _saveEntryDels(dels);

    // Newest-first by createdAt — the journal renderer and delete-undo logic
    // both assume this ordering.
    const merged = Array.from(byId.values());
    merged.sort((a, b) => _clampSyncTs(b.createdAt) - _clampSyncTs(a.createdAt));
    state.entries = merged;
  } catch (e) {
    console.warn("[sync] mergeState failed", e);
  }

  // Persist + re-render without echoing the merge back to the peer.
  _applyingRemote = true;
  try {
    if (typeof persist === "function") persist();
    if (typeof render === "function") render();
  } finally {
    _applyingRemote = false;
  }
}

// ── Incoming-connection consent banner ───────────────────────────────────────

function syncHideIncomingBanner() {
  const b = document.getElementById("syncIncomingBar");
  if (b) b.remove();
}

function syncShowIncomingBanner(peerLabel) {
  syncHideIncomingBanner();
  const safe = String(peerLabel || "unknown").replace(/[<>&"]/g, "");
  const bar = document.createElement("div");
  bar.id = "syncIncomingBar";
  bar.className = "sync-incoming-bar";
  bar.innerHTML =
    '<div class="sync-incoming-inner"><strong>Incoming sync</strong> from <code>' + safe +
    '</code> — accept only if this is your device.</div>' +
    '<div class="sync-incoming-actions">' +
    '<button type="button" class="btn btn-primary" id="syncAcceptInbound">Accept</button>' +
    '<button type="button" class="btn btn-ghost" id="syncRejectInbound">Reject</button></div>';
  document.body.appendChild(bar);
  const a = document.getElementById("syncAcceptInbound");
  const r = document.getElementById("syncRejectInbound");
  if (a) a.onclick = () => syncAcceptInbound();
  if (r) r.onclick = () => syncRejectInbound();
}

function syncAcceptInbound() {
  const conn = _pendingInboundConn;
  if (!conn) return;
  _pendingInboundConn = null;
  syncHideIncomingBanner();
  if (_conn) { try { _conn.close(); } catch { /* noop */ } _conn = null; }
  _wireConn(conn);
}

function syncRejectInbound() {
  const conn = _pendingInboundConn;
  _pendingInboundConn = null;
  syncHideIncomingBanner();
  if (conn) { try { conn.close(); } catch { /* noop */ } }
}

// ── Connection handling ──────────────────────────────────────────────────────

function _wireConn(conn) {
  _conn = conn;

  conn.on("open", () => {
    _setSyncStatus("connected");
    if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
    _reconnectAttempt = 0;
    try { conn.send({ type: "state", payload: _packState() }); }
    catch (e) { console.warn("[sync] send state", e); }
    try { localStorage.setItem(SYNC_ROOM_KEY, _idToCode(conn.peer)); } catch { /* noop */ }
  });

  conn.on("data", (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === "state" || msg.type === "patch") {
      _mergeState(msg.payload);
    } else if (msg.type === "ping") {
      try { conn.send({ type: "pong" }); } catch { /* noop */ }
    }
  });

  conn.on("close", () => {
    _conn = null;
    if (_syncStatus !== "error" && _syncStatus !== "connected") _setSyncStatus("waiting");
    if (_lastConnectCode) _scheduleSyncReconnect();
  });

  conn.on("error", (err) => {
    console.warn("[sync] conn error", err);
    _conn = null;
    if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
    _setSyncStatus("error", _friendlySyncError(err));
    if (_lastConnectCode) _scheduleSyncReconnect();
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

function _resolvePeerId() {
  let saved = null;
  try { saved = localStorage.getItem(SYNC_PEER_KEY); } catch { /* noop */ }
  if (!saved) {
    saved = _genPeerId();
    try { localStorage.setItem(SYNC_PEER_KEY, saved); } catch { /* noop */ }
  }
  return saved;
}

let _syncInitPromise = null;
async function syncInit() {
  if (_peer) return;
  if (_syncInitPromise) return _syncInitPromise;
  _syncInitPromise = (async () => {
    _setSyncStatus("loading");

    let Peer;
    try { Peer = await _loadPeerJS(); }
    catch { _setSyncStatus("error", "Sync engine unavailable"); return; }

    const myId = _resolvePeerId();
    _myRoomCode = _idToCode(myId);
    const codeEl = document.getElementById("syncMyCode");
    if (codeEl) codeEl.textContent = _myRoomCode;

    _peer = new Peer(myId, {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
        ],
      },
    });

    _peer.on("open", () => {
      _setSyncStatus("waiting");
      const lastRoom = localStorage.getItem(SYNC_ROOM_KEY);
      if (lastRoom && lastRoom !== _myRoomCode) syncConnect(lastRoom);
    });

    _peer.on("connection", (conn) => {
      if (!_syncEnabled)              { try { conn.close(); } catch { /* noop */ } return; }
      if (_conn && _conn.open)        { try { conn.close(); } catch { /* noop */ } return; }
      if (_pendingInboundConn)        { try { conn.close(); } catch { /* noop */ } return; }
      _pendingInboundConn = conn;
      conn.on("close", () => { if (_pendingInboundConn === conn) { _pendingInboundConn = null; syncHideIncomingBanner(); } });
      conn.on("error", () => { if (_pendingInboundConn === conn) { _pendingInboundConn = null; syncHideIncomingBanner(); } });
      syncShowIncomingBanner(_idToCode(conn.peer));
    });

    _peer.on("error", (err) => {
      console.warn("[sync] peer error", err);
      const t = err && err.type;
      if (t === "unavailable-id") {
        try { localStorage.removeItem(SYNC_PEER_KEY); } catch { /* noop */ }
        _peer = null;
        syncInit();
        return;
      }
      if (t === "peer-unavailable") {
        if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
        _setSyncStatus("error", "Code not found — device is offline or the code is mistyped");
        return;
      }
      if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") {
        if (_lastConnectCode) _scheduleSyncReconnect();
        else _setSyncStatus("error", "Lost connection to matchmaking server — check internet");
        return;
      }
      if (t === "browser-incompatible") {
        _setSyncStatus("error", "Browser does not support WebRTC data channels");
        return;
      }
      _setSyncStatus("error", _friendlySyncError(err));
    });

    _peer.on("disconnected", () => {
      _setSyncStatus("waiting");
      try { _peer.reconnect(); } catch (e) { console.warn("[sync] reconnect", e); }
    });
  })();
  try { await _syncInitPromise; } finally { _syncInitPromise = null; }
}

function _scheduleSyncReconnect() {
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  if (!_lastConnectCode || !_syncEnabled) {
    _setSyncStatus("error", "Lost connection — Reconnect to retry");
    return;
  }
  if (_reconnectAttempt >= SYNC_RECONNECT_BACKOFFS_MS.length) {
    _setSyncStatus("error", "Reconnect failed after " + SYNC_RECONNECT_BACKOFFS_MS.length + " attempts — try Reconnect manually");
    return;
  }
  const wait = SYNC_RECONNECT_BACKOFFS_MS[_reconnectAttempt];
  _reconnectAttempt += 1;
  _setSyncStatus("error", "Reconnecting in " + Math.round(wait / 1000) + "s (attempt " + _reconnectAttempt + "/" + SYNC_RECONNECT_BACKOFFS_MS.length + ")");
  _reconnectTimerId = setTimeout(() => {
    _reconnectTimerId = null;
    if (!_syncEnabled || !_lastConnectCode) return;
    _setSyncStatus("connecting", "Reconnecting (attempt " + _reconnectAttempt + "/" + SYNC_RECONNECT_BACKOFFS_MS.length + ")…");
    try { syncConnect(_lastConnectCode); }
    catch (e) { console.warn("[sync] reconnect failed", e); _scheduleSyncReconnect(); }
  }, wait);
}

function syncReconnectNow() {
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  _reconnectAttempt = 0;
  if (_lastConnectCode) {
    _setSyncStatus("connecting", "Reconnecting…");
    try { syncConnect(_lastConnectCode); } catch (e) { console.warn("[sync] reconnect failed", e); }
  }
}

function syncConnect(code) {
  if (!_peer) { syncInit().then(() => syncConnect(code)).catch(e => console.warn("[sync] init failed", e)); return; }
  if (!_isValidCode(code)) {
    _setSyncStatus("error", "Invalid code — expected 6 letters/digits after " + CODE_BRAND + "-");
    return;
  }
  const targetId = _codeToId(code);
  if (targetId === _peer.id) {
    _setSyncStatus("error", "That's this device's own code");
    return;
  }
  _lastConnectCode = code;
  _setSyncStatus("connecting");

  if (_conn) { try { _conn.close(); } catch { /* noop */ } _conn = null; }

  const conn = _peer.connect(targetId, { reliable: true });

  if (_connectTimeoutId) clearTimeout(_connectTimeoutId);
  _connectTimeoutId = setTimeout(() => {
    _connectTimeoutId = null;
    if (conn && !conn.open) {
      try { conn.close(); } catch { /* noop */ }
      _setSyncStatus("error",
        "No response — the other device may be on a different network " +
        "(cellular or a restrictive firewall can block peer-to-peer). " +
        "Try again on the same WiFi.");
    }
  }, 20000);

  conn.on("open",  () => { if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; } });
  conn.on("error", () => { if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; } });

  _wireConn(conn);
}

async function syncRegenerateCode() {
  const msg = "Regenerating your code unpairs every device that knows the current code. They'll need the new code to reconnect. Continue?";
  if (!confirm(msg)) return;
  try { localStorage.removeItem(SYNC_PEER_KEY); } catch { /* noop */ }
  try { localStorage.removeItem(SYNC_ROOM_KEY); } catch { /* noop */ }
  if (_conn) { try { _conn.close(); } catch { /* noop */ } _conn = null; }
  if (_peer) { try { _peer.destroy(); } catch { /* noop */ } _peer = null; }
  _setSyncStatus("loading");
  syncInit().then(() => renderSyncPanel()).catch(e => console.warn("[sync] init failed", e));
}

function syncDisconnect() {
  if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  _reconnectAttempt = 0;
  _lastConnectCode = null;
  if (_conn) { try { _conn.close(); } catch { /* noop */ } _conn = null; }
  if (_peer) { try { _peer.destroy(); } catch { /* noop */ } _peer = null; }
  try { localStorage.removeItem(SYNC_ROOM_KEY); } catch { /* noop */ }
  _setSyncStatus("off");
  _syncEnabled = false;
  renderSyncPanel();
}

window.addEventListener("beforeunload", () => {
  if (_conn) { try { _conn.close(); } catch { /* noop */ } }
  if (_peer) { try { _peer.destroy(); } catch { /* noop */ } }
});

// ── Broadcast (called from app.js persist) ───────────────────────────────────

let _broadcastTimer  = null;
let _lastBroadcastAt = 0;
function syncBroadcast() {
  if (_applyingRemote) return;          // don't echo a merge back to the peer
  if (!_conn || !_conn.open) return;
  const now = Date.now();
  if (now - _lastBroadcastAt < 500) {   // throttle: ≤1 broadcast / 500ms
    clearTimeout(_broadcastTimer);
    _broadcastTimer = setTimeout(() => {
      _lastBroadcastAt = Date.now();
      _broadcastTimer = null;
      try { _conn.send({ type: "patch", payload: _packState() }); } catch (e) { console.warn("[sync] broadcast", e); }
    }, 500);
    return;
  }
  _lastBroadcastAt = now;
  try { _conn.send({ type: "patch", payload: _packState() }); } catch (e) { console.warn("[sync] broadcast", e); }
}

// ── Panel UI ─────────────────────────────────────────────────────────────────
// Self-contained: builds #syncPanel's innerHTML and wires its own listeners,
// so it doesn't depend on app.js's per-render querySelectorAll wiring. Called
// from bindModal() whenever the Settings modal is rendered.

function _renderSyncActionRow() {
  const row = document.getElementById("syncActionRow");
  if (!row) return;
  if (_lastConnectCode && (_syncStatus === "error" || _reconnectTimerId)) {
    row.innerHTML = '<button class="btn btn-ghost sync-btn-sm" id="syncReconnectBtn">Reconnect now</button>';
    const b = document.getElementById("syncReconnectBtn");
    if (b) b.onclick = () => syncReconnectNow();
  } else {
    row.innerHTML = "";
  }
}

function renderSyncPanel() {
  const panel = document.getElementById("syncPanel");
  if (!panel) return;

  if (!_syncEnabled) {
    panel.innerHTML =
      '<p class="settings-section-help">Sync your journal entries between your own devices, directly and end-to-end — no account, no server stores your data. Settings and your PIN stay local to each device.</p>' +
      '<p class="settings-section-help" style="margin-top:4px;">Best effort: works reliably on the same WiFi; may fail on some cellular networks due to NAT restrictions.</p>' +
      '<div class="sync-off-actions"><button class="btn btn-primary" id="syncEnableBtn">Enable sync</button></div>';
    const en = document.getElementById("syncEnableBtn");
    if (en) en.onclick = () => syncEnable();
    return;
  }

  panel.innerHTML =
    '<div class="sync-active">' +
      '<div class="sync-status-row"><span class="sync-dot sync-dot--' + _syncStatus + '" id="syncDot"></span><span id="syncStatus"></span></div>' +
      '<div class="sync-my-code-block">' +
        '<label>Your code</label>' +
        '<div class="sync-code" id="syncMyCode">' + (_myRoomCode || "…") + '</div>' +
        '<div class="sync-code-actions">' +
          '<button class="btn btn-ghost sync-btn-sm" id="syncCopyBtn">Copy</button>' +
          '<button class="btn btn-ghost sync-btn-sm" id="syncRegenBtn" title="Mint a new pairing code (unpairs this device)">Regenerate</button>' +
        '</div>' +
      '</div>' +
      '<div class="sync-connect-block">' +
        '<label>Connect to a device</label>' +
        '<div class="sync-input-row">' +
          '<input id="syncCodeInput" type="text" placeholder="' + CODE_BRAND + '-XXX-XXX" maxlength="11" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
          '<button class="btn btn-primary sync-btn-sm" id="syncConnectBtn" disabled>Connect</button>' +
        '</div>' +
        '<div class="sync-input-hint" id="syncInputHint">Enter the 6-character code shown on the other device (e.g. <code>' + CODE_BRAND + '-AB3-C9D</code>).</div>' +
      '</div>' +
      '<div class="sync-action-row" id="syncActionRow"></div>' +
      '<button class="btn btn-ghost sync-btn-sm sync-disable" id="syncDisableBtn">Disable sync</button>' +
    '</div>';

  const copyBtn = document.getElementById("syncCopyBtn");
  if (copyBtn) copyBtn.onclick = () => {
    const code = _myRoomCode || "";
    if (navigator.clipboard && code) {
      navigator.clipboard.writeText(code)
        .then(() => { if (typeof toast === "function") toast("Code copied"); })
        .catch(() => { if (typeof toast === "function") toast("Couldn't copy — copy it manually"); });
    }
  };
  const regenBtn = document.getElementById("syncRegenBtn");
  if (regenBtn) regenBtn.onclick = () => syncRegenerateCode();
  const disableBtn = document.getElementById("syncDisableBtn");
  if (disableBtn) disableBtn.onclick = () => syncDisconnect();

  const input = document.getElementById("syncCodeInput");
  const connectBtn = document.getElementById("syncConnectBtn");
  if (input) {
    input.oninput = () => syncOnCodeInput(input);
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); syncConnectFromInput(); } };
  }
  if (connectBtn) connectBtn.onclick = () => syncConnectFromInput();

  _renderSyncActionRow();
  _setSyncStatus(_syncStatus);
}

function syncOnCodeInput(el) {
  if (!el) return;
  let raw = String(el.value || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  raw = raw.replace(/-+/g, "-").replace(/^-|-$/g, "");
  // Live-format RFR-XXX-XXX. Only reformat once there's enough to commit to
  // (>3 chars after the brand, or ≥3 bare chars), so the user can still type
  // the literal "RFR" prefix without it being rewritten mid-keystroke.
  const compact = raw.replace(/-/g, "");
  if (compact.startsWith(CODE_BRAND) && compact.length > CODE_BRAND.length) {
    const body = compact.slice(CODE_BRAND.length);
    let formatted = CODE_BRAND;
    if (body.length > 0) formatted += "-" + body.slice(0, 3);
    if (body.length > 3) formatted += "-" + body.slice(3, 6);
    raw = formatted;
  } else if (!compact.startsWith(CODE_BRAND) && compact.length >= 3) {
    let formatted = CODE_BRAND;
    formatted += "-" + compact.slice(0, 3);
    if (compact.length > 3) formatted += "-" + compact.slice(3, 6);
    raw = formatted;
  }
  el.value = raw;

  const btn  = document.getElementById("syncConnectBtn");
  const hint = document.getElementById("syncInputHint");
  const ok = _isValidCode(raw);
  if (btn) btn.disabled = !ok;
  if (hint) {
    if (!raw || raw === CODE_BRAND) {
      hint.innerHTML = "Enter the 6-character code shown on the other device (e.g. <code>" + CODE_BRAND + "-AB3-C9D</code>).";
      hint.classList.remove("sync-input-hint--err");
    } else if (!ok) {
      const n = _normalizeCode(raw).length;
      hint.textContent = n < 6 ? ("Keep typing — " + n + "/6 characters so far.") : "Too long — pairing codes are 6 letters/digits.";
      hint.classList.add("sync-input-hint--err");
    } else {
      hint.textContent = "Ready — press Connect.";
      hint.classList.remove("sync-input-hint--err");
    }
  }
}

function syncEnable() {
  _syncEnabled = true;
  renderSyncPanel();
  syncInit();
}

function syncConnectFromInput() {
  const val = (document.getElementById("syncCodeInput")?.value || "").trim();
  if (!_isValidCode(val)) {
    _setSyncStatus("error", "Invalid code — expected 6 letters/digits after " + CODE_BRAND + "-");
    return;
  }
  syncConnect(val);
}

// Expose the functions app.js / inline handlers reference.
if (typeof window !== "undefined") {
  window.renderSyncPanel        = renderSyncPanel;
  window.syncBroadcast          = syncBroadcast;
  window.syncRecordEntryDeletion = syncRecordEntryDeletion;
  window.syncClearEntryDeletion  = syncClearEntryDeletion;
}
