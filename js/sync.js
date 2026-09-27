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
// ── Pairing + wire protocol (v2) ─────────────────────────────────────────
// PeerJS ids are first-come on a public broker with no proof of ownership,
// so a peer id on its own must never be trusted: anyone who learns a device
// id can register it while the real device is offline and receive whatever
// the other device sends on connect. Pairing therefore carries a secret, and
// nothing about the journal crosses the wire until both ends have proved
// they hold it.
//
//   pairing code  = ROOM (6 chars) + SECRET (12 chars), Crockford base32,
//                   shown once as XXX-XXX-YYYY-YYYY-YYYY on the device that
//                   generated it. ROOM is that device's peer id suffix
//                   ("rephrame-" + room, lower-cased); SECRET never leaves
//                   the two devices.
//   keys          = PBKDF2-SHA256(secret, salt "rephrame-sync-v2:" + ROOM,
//                   100 000 iterations, 512 bits) → AES-256-GCM key ‖
//                   HMAC-SHA256 key, imported as NON-extractable WebCrypto
//                   keys the moment a code is generated or typed and kept in
//                   IndexedDB (database "rephrame-sync", store "keys", record
//                   "pairing" = {room, aes, mac}). The secret itself is never
//                   written anywhere: the device that generated it holds it
//                   in memory only until a device pairs (or the page reloads),
//                   the device that typed it drops it right after derivation,
//                   and localStorage keeps just {room, peer, verified}.
//   handshake     = dialer sends   {type:"hello",     v:2, nonce:Ni}
//                   listener sends {type:"hello-ack", v:2, nonce:Nr,
//                                   proof:HMAC("ack|"+Ni)}
//                   dialer sends   {type:"hello-ok",  v:2, proof:HMAC("ok|"+Nr)}
//                   Each side verifies the proof it receives (constant-time)
//                   before doing anything else; only then is the link ready.
//   transport     = every later message is {type:"enc", v:2, iv, ct} —
//                   AES-GCM over the JSON of the original message, with the
//                   session nonces + sender role as additional data — and is
//                   decrypted before the existing merge handlers run.
//
// A message before readiness other than the three handshake types, a bad
// proof, a wrong version or a decryption failure closes the connection at
// once ("Sync pairing failed"); repeated failures back off inbound answers so
// a guessing peer is closed, not served. Pairings stored before v2 (a room
// with no secret) are neither dialled nor accepted: the panel asks for a new
// code. While the journal is PIN-locked no peer is registered at all.

const SYNC_PEER_KEY        = "rephrame_peer_id_v1";    // this device's PeerJS id
const SYNC_PAIR_KEY        = "rephrame_sync_pair_v2";  // {room, peer, verified} — never the secret
const SYNC_DB_NAME         = "rephrame-sync";           // IndexedDB: derived keys live here …
const SYNC_DB_STORE        = "keys";
const SYNC_DB_RECORD       = "pairing";                 // … as {room, aes, mac} (non-extractable CryptoKeys)
const SYNC_LEGACY_ROOM_KEY = "rephrame_sync_room";     // pre-v2 paired room (read only to detect it)
const SYNC_DELS_KEY        = "rephrame_entry_dels";
const SYNC_ENABLED_KEY     = "rephrame_sync_enabled";
const SYNC_VERSION  = 1;  // payload schema (entries + tombstones)
const SYNC_PROTO_V  = 2;  // wire protocol (handshake + encryption)
// Crockford base32: 0-9 and A-Z without I, L, O, U. 32 symbols divide 256
// evenly, so `byte % 32` is exactly uniform.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_BRAND    = "RFR";   // tolerated on input (older display prefix), never shown
const ROOM_LEN      = 6;
const SECRET_LEN    = 12;
const CODE_LEN      = ROOM_LEN + SECRET_LEN;
const SYNC_KDF_ITERATIONS = 100000;
const SYNC_KDF_SALT_PREFIX = "rephrame-sync-v2:";
const SYNC_HANDSHAKE_TIMEOUT_MS = 45000;   // room for the other side to tap Accept
const SYNC_MISMATCH_MSG = "Sync pairing failed: codes do not match. Generate a new pairing code and enter it again on the other device.";

let _peer        = null;   // PeerJS instance
let _conn        = null;   // active DataConnection
let _readyConn   = null;   // _conn once its handshake has completed
let _activeSend  = null;   // encrypting sender bound to _readyConn
let _syncEnabled = false;
let _syncStatus  = "off";  // 'off' | 'unpaired' | 'loading' | 'waiting' | 'connecting' | 'connected' | 'error'
let _pairing     = null;   // in-memory copy of SYNC_PAIR_KEY: {room, peer, verified}
let _pairingGen  = 0;      // bumps whenever _pairing changes, invalidates _keys
let _keys        = null;   // {gen, room, aes, mac} — memory cache of the IndexedDB record
let _keysVolatile = false; // keys exist in memory only (IndexedDB refused them)
let _offerSecret = null;   // the secret of a code this device generated, until a device pairs
let _mintPromise = null;   // in-flight _mintPairing()
let _connectTimeoutId   = null;
let _pendingInboundConn = null;
// Suppress re-broadcast while we're applying a peer's state, so an incoming
// merge → persist() doesn't echo straight back and cause a ping-pong.
let _applyingRemote = false;

// Auto-reconnect: remember the target id, retry with exponential backoff,
// stop after the last attempt so the user can manually Reconnect.
let _lastDialId       = null;
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

// Crypto-strong random string over CODE_ALPHABET. Used for the room id (the
// device's peer id) and for the 12-character pairing secret (60 bits).
function _randomCode(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s;
}

function _genPeerId() {
  return _roomToId(_randomCode(ROOM_LEN));
}

function _roomToId(room) { return "rephrame-" + String(room || "").toLowerCase(); }
function _idToRoom(id)   { return String(id || "").replace(/^rephrame-/, "").toUpperCase(); }

// Display label for a device (its room id), e.g. "AB3-C9D". Never includes a
// secret — this is what the status row and the consent banner show.
function _idToCode(id) {
  const suffix = _idToRoom(id);
  if (suffix.length === ROOM_LEN) return suffix.slice(0, 3) + "-" + suffix.slice(3);
  const half = Math.ceil(suffix.length / 2);
  return suffix.slice(0, half) + "-" + suffix.slice(half);
}

function _formatCode(room, secret) {
  const s = String(secret || "");
  return _idToCode(_roomToId(room)) + "-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}

// Compact a typed/pasted code: case-insensitive, dashes/spaces optional, the
// old "RFR-" display prefix tolerated, and the Crockford look-alikes folded
// (I/L → 1, O → 0). Returns the bare uppercase string.
function _normalizeCode(code) {
  let raw = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith(CODE_BRAND) &&
      (raw.length === CODE_LEN + CODE_BRAND.length || raw.length === ROOM_LEN + CODE_BRAND.length)) {
    raw = raw.slice(CODE_BRAND.length);
  }
  return raw.replace(/[IL]/g, "1").replace(/O/g, "0");
}

// → {ok:true, room, secret} | {ok:false, legacy:true, message} | {ok:false, message}
function _parseCode(code) {
  const n = _normalizeCode(code);
  if (n.length === ROOM_LEN) {
    return { ok: false, legacy: true,
      message: "That looks like a code from an older version of Rephrame. Update Rephrame on the other device, generate a new pairing code there, and enter that one." };
  }
  if (n.length !== CODE_LEN) {
    return { ok: false, message: "Invalid code — expected " + CODE_LEN + " letters/digits (" + n.length + " entered)." };
  }
  if (![...n].every(c => CODE_ALPHABET.includes(c))) {
    return { ok: false, message: "Invalid code — pairing codes only use digits and the letters A-H, J, K, M, N, P-T, V-Z." };
  }
  return { ok: true, room: n.slice(0, ROOM_LEN), secret: n.slice(ROOM_LEN) };
}

function _isValidCode(code) { return _parseCode(code).ok; }

function _b64(bytes) {
  let s = "";
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

// Strict base64 → bytes, or null. Wire fields are attacker-controlled until
// the handshake completes, so never let a malformed string throw.
function _unb64(str) {
  if (typeof str !== "string" || str.length > 16_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) return null;
  try {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

// Constant-time byte comparison: the accumulated XOR never short-circuits on
// the first differing byte, so timing reveals nothing about how much of a
// proof matched. (A length mismatch is not secret.)
function _ctEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function _escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function _isLocked() {
  return typeof hasPin === "function" && typeof isUnlocked === "function" && hasPin() && !isUnlocked();
}

function _friendlySyncError(err) {
  const t = (err && (err.type || err.code)) || "";
  const map = {
    "peer-unavailable":     "Device not found — the other device is offline or the code is mistyped.",
    "network":              "Network error — check your internet connection.",
    "server-error":         "Matchmaking server unreachable — retrying.",
    "socket-error":         "Lost connection to matchmaking server — retrying.",
    "socket-closed":        "Matchmaking connection closed — retrying.",
    "disconnected":         "Disconnected from the broker — reconnecting.",
    "browser-incompatible": "Browser does not support WebRTC data channels.",
    "webrtc":               "WebRTC negotiation failed — try Reconnect or pairing again.",
    "unavailable-id":       "This device's id is busy on the sync broker.",
  };
  if (t && map[t]) return map[t];
  if (err && err.message) return String(err.message);
  return "Connection failed";
}

let _syncStatusMsg = "";
function _setSyncStatus(status, msg) {
  _syncStatus = status;
  // Remember the detail message so re-rendering the panel (closing and
  // reopening Settings) doesn't degrade a specific error to a generic one.
  _syncStatusMsg = msg || ((status === "error" || status === "unpaired") ? _syncStatusMsg : "");
  const el  = document.getElementById("syncStatus");
  const dot = document.getElementById("syncDot");
  if (!el) return;
  const peerCode = (status === "connected" && _conn && _conn.peer) ? _idToCode(_conn.peer) : null;
  const labels = {
    off:        "Sync off",
    unpaired:   _syncStatusMsg || (_hasLegacyPairing() ? "Sync paused — re-pairing needed" : "Not paired — generate a pairing code"),
    loading:    "Loading…",
    waiting:    "Waiting for the other device…",
    connecting: "Connecting…",
    connected:  peerCode ? ("Synced with " + peerCode) : "Synced",
    error:      _syncStatusMsg || "Error",
  };
  el.textContent = labels[status] || status;
  if (dot) dot.className = "sync-dot sync-dot--" + status;
  // Re-render the action row (Reconnect button visibility) when status flips.
  _renderSyncActionRow();
}

// ── Pairing record ───────────────────────────────────────────────────────────
// {room, peer, verified}: `room` is what the pairing code starts with (the
// same on both devices; it salts the key derivation); `peer` is the OTHER
// device's PeerJS id — known up front on the device that typed the code,
// learned from the first verified connection on the device that showed it;
// `verified` flips once a handshake has succeeded. The secret is NOT part of
// the record: only the keys derived from it are kept, in IndexedDB.

function _validRoom(s)   { return typeof s === "string" && s.length === ROOM_LEN   && [...s].every(c => CODE_ALPHABET.includes(c)); }
function _validSecret(s) { return typeof s === "string" && s.length === SECRET_LEN && [...s].every(c => CODE_ALPHABET.includes(c)); }

function _loadPairing() {
  let raw = null;
  try { raw = localStorage.getItem(SYNC_PAIR_KEY); } catch { /* noop */ }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object" || !_validRoom(p.room)) return null;
    // A record carrying a secret is from a pre-release build that stored it
    // in the clear; refuse it outright rather than migrate (a fresh code is
    // one tap away).
    if ("secret" in p) return null;
    return {
      room: p.room,
      peer: (typeof p.peer === "string" && /^rephrame-[a-z0-9]{1,32}$/.test(p.peer)) ? p.peer : null,
      verified: p.verified === true,
    };
  } catch { return null; }
}

function _savePairingRecord() {
  try {
    if (_pairing) localStorage.setItem(SYNC_PAIR_KEY, JSON.stringify({ room: _pairing.room, peer: _pairing.peer, verified: _pairing.verified }));
    else localStorage.removeItem(SYNC_PAIR_KEY);
  } catch { /* noop */ }
}

// Replace the pairing record. Keys for the new room are installed separately
// (_storeKeys) right after; clearing the pairing also deletes the stored keys.
function _setPairing(p) {
  _pairing = p ? { room: p.room, peer: p.peer || null, verified: !!p.verified } : null;
  _pairingGen += 1;
  _keys = null;
  _keysVolatile = false;
  _offerSecret = null;
  _savePairingRecord();
  if (!_pairing) _deleteStoredKeys();
}

function _hasLegacyPairing() {
  let legacy = null;
  try { legacy = localStorage.getItem(SYNC_LEGACY_ROOM_KEY); } catch { /* noop */ }
  return !!legacy && !_pairing;
}

function _clearLegacyPairing() {
  try { localStorage.removeItem(SYNC_LEGACY_ROOM_KEY); } catch { /* noop */ }
}

function _myPeerId() {
  let saved = null;
  try { saved = localStorage.getItem(SYNC_PEER_KEY); } catch { /* noop */ }
  return saved || null;
}

function _myRoom() { return _idToRoom(_myPeerId()); }

// This device generated the current pairing (its own id is the room).
function _isPairingHost() { return !!(_pairing && _pairing.room === _myRoom()); }

// Mint a fresh room id (= a fresh peer id for this device) and secret. Any
// earlier pairing, v2 or legacy, is gone: the other device must be re-paired
// with the new code. The secret is turned into keys immediately and then
// lives only in _offerSecret, for the panel and the Copy button, until a
// device pairs or the page is closed — it is never stored.
function _mintPairing() {
  if (_mintPromise) return _mintPromise;
  _mintPromise = (async () => {
    const room = _randomCode(ROOM_LEN);
    const secret = _randomCode(SECRET_LEN);
    const k = await _deriveKeys(secret, room);
    try { localStorage.setItem(SYNC_PEER_KEY, _roomToId(room)); } catch { /* noop */ }
    _clearLegacyPairing();
    _setPairing({ room, peer: null, verified: false });
    await _storeKeys(room, k.aes, k.mac);
    _offerSecret = secret;
    return room;
  })();
  const p = _mintPromise;
  p.then(() => { if (_mintPromise === p) _mintPromise = null; },
         () => { if (_mintPromise === p) _mintPromise = null; });
  return p;
}

// ── Key derivation + message crypto ──────────────────────────────────────────

async function _deriveKeys(secret, room) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw", enc.encode(String(secret)), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(SYNC_KDF_SALT_PREFIX + String(room)),
      iterations: SYNC_KDF_ITERATIONS, hash: "SHA-256" },
    base, 512);
  const bytes = new Uint8Array(bits);
  const aes = await crypto.subtle.importKey(
    "raw", bytes.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const mac = await crypto.subtle.importKey(
    "raw", bytes.slice(32, 64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return { aes, mac };
}

// ── Key storage (IndexedDB) ──────────────────────────────────────────────────
// The derived keys are what a device keeps; the secret never is. CryptoKeys
// are structured-cloneable, so the non-extractable objects go straight into
// IndexedDB and come back unusable to anything but SubtleCrypto. Every
// operation opens the database, runs one request in its own transaction and
// closes again; they are serialised so a delete can't overtake a later put.

function _idbOpen() {
  return new Promise((res, rej) => {
    let req;
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) throw new Error("IndexedDB unavailable");
      req = indexedDB.open(SYNC_DB_NAME, 1);
    } catch (e) { rej(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SYNC_DB_STORE)) db.createObjectStore(SYNC_DB_STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error || new Error("IndexedDB open failed"));
    req.onblocked = () => rej(new Error("IndexedDB open blocked"));
  });
}

function _idbRun(mode, fn) {
  return _idbOpen().then(db => new Promise((res, rej) => {
    let result;
    let tx;
    try { tx = db.transaction(SYNC_DB_STORE, mode); } catch (e) { try { db.close(); } catch { /* noop */ } rej(e); return; }
    const done = (err) => { try { db.close(); } catch { /* noop */ } if (err) rej(err); else res(result); };
    tx.oncomplete = () => done(null);
    tx.onerror    = () => done(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort    = () => done(tx.error || new Error("IndexedDB transaction aborted"));
    let req;
    try { req = fn(tx.objectStore(SYNC_DB_STORE)); } catch (e) { done(e); return; }
    req.onsuccess = () => { result = req.result; };
  }));
}

let _idbQueue = Promise.resolve();
function _idbSerial(fn) {
  const p = _idbQueue.then(fn, fn);
  _idbQueue = p.catch(() => { /* the caller handles it */ });
  return p;
}
const _idbGet    = (key)        => _idbSerial(() => _idbRun("readonly",  s => s.get(key)));
const _idbPut    = (key, value) => _idbSerial(() => _idbRun("readwrite", s => s.put(value, key)));
const _idbDelete = (key)        => _idbSerial(() => _idbRun("readwrite", s => s.delete(key)));

// Cache the keys for this session and persist them. When IndexedDB refuses
// (private mode, quota, no API) the pairing still works until the page is
// closed; the panel says so.
async function _storeKeys(room, aes, mac) {
  const gen = _pairingGen;
  _keys = { gen, room, aes, mac };
  _keysVolatile = false;
  try { await _idbPut(SYNC_DB_RECORD, { room, aes, mac }); }
  catch (e) {
    console.warn("[sync] sync keys could not be persisted; this pairing will not survive a reload", e);
    if (_pairingGen === gen) { _keysVolatile = true; renderSyncPanel(); }
  }
}

async function _loadStoredKeys() {
  try {
    const rec = await _idbGet(SYNC_DB_RECORD);
    if (rec && typeof rec === "object" && _validRoom(rec.room) && rec.aes && rec.mac) return rec;
    return null;
  } catch { return null; }
}

function _deleteStoredKeys() {
  return _idbDelete(SYNC_DB_RECORD).catch(() => { /* nothing stored, or storage unavailable */ });
}

// Keys for the current pairing: the session cache, else the IndexedDB record
// for this room. Throws "not paired" when neither exists — the record in
// localStorage alone is useless.
async function _getKeys() {
  if (!_pairing) throw new Error("not paired");
  if (_keys && _keys.gen === _pairingGen) return _keys;
  const gen = _pairingGen;
  const room = _pairing.room;
  const rec = await _loadStoredKeys();
  if (gen !== _pairingGen) throw new Error("pairing changed");
  if (!rec || rec.room !== room) throw new Error("not paired");
  _keys = { gen, room, aes: rec.aes, mac: rec.mac };
  return _keys;
}

async function _hmac(macKey, text) {
  const sig = await crypto.subtle.sign("HMAC", macKey, new TextEncoder().encode(String(text)));
  return new Uint8Array(sig);
}

async function _makeProof(macKey, label, nonceB64) {
  return _b64(await _hmac(macKey, label + "|" + nonceB64));
}

async function _verifyProof(macKey, label, nonceB64, proofB64) {
  const got = _unb64(proofB64);
  if (!got || got.length !== 32) return false;
  return _ctEqual(got, await _hmac(macKey, label + "|" + nonceB64));
}

// A nonce is valid only if it is the base64 of exactly 16 bytes.
function _validNonce(s) {
  const b = _unb64(s);
  return !!(b && b.length === 16);
}

function _newNonce() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return _b64(b);
}

// Additional data binds every ciphertext to this session (both nonces) and
// to its direction, so a message can't be replayed into a later session or
// reflected back at its sender.
function _aadFor(initiatorNonce, responderNonce, role) {
  return new TextEncoder().encode("rephrame-sync-v" + SYNC_PROTO_V + "|" + initiatorNonce + "|" + responderNonce + "|" + role);
}

async function _encryptMessage(keys, aad, inner) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const pt = new TextEncoder().encode(JSON.stringify(inner));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, keys.aes, pt);
  return { type: "enc", v: SYNC_PROTO_V, iv: _b64(iv), ct: _b64(ct) };
}

// Throws on anything that isn't a well-formed, authentic ciphertext.
async function _decryptMessage(keys, aad, msg) {
  if (!msg || msg.type !== "enc" || msg.v !== SYNC_PROTO_V) throw new Error("not an enc message");
  const iv = _unb64(msg.iv);
  const ct = _unb64(msg.ct);
  if (!iv || iv.length !== 12 || !ct || ct.length < 16) throw new Error("bad iv/ct");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, keys.aes, ct);
  const inner = JSON.parse(new TextDecoder().decode(pt));
  if (!inner || typeof inner !== "object" || Array.isArray(inner) || typeof inner.type !== "string") throw new Error("bad inner message");
  return inner;
}

// ── Handshake failure throttle ───────────────────────────────────────────────
// Every failed handshake (either role) backs off inbound connections: 2s,
// 4s, … up to 60s, and ten failures inside 15 minutes stop answering
// altogether until they age out. A peer guessing secrets is closed on
// arrival instead of being handed an HMAC to test against.

let _hsFailTimes = [];
let _hsBlockedUntil = 0;
let _lastFailToastAt = 0;
const _HS_FAIL_WINDOW_MS = 15 * 60 * 1000;
const _HS_FAIL_MAX = 10;

function _pruneHsFailures() {
  const now = Date.now();
  _hsFailTimes = _hsFailTimes.filter(t => now - t < _HS_FAIL_WINDOW_MS);
  return now;
}

function _recordHandshakeFailure() {
  const now = _pruneHsFailures();
  _hsFailTimes.push(now);
  const n = _hsFailTimes.length;
  _hsBlockedUntil = now + Math.min(2000 * Math.pow(2, n - 1), 60000);
}

function _inboundBlocked() {
  const now = _pruneHsFailures();
  return now < _hsBlockedUntil || _hsFailTimes.length >= _HS_FAIL_MAX;
}

// ── PeerJS loader (vendored, lazy) ───────────────────────────────────────────

let _peerJSLoadPromise = null;
function _loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  // Reuse an in-flight load — concurrent callers (enable + connect) must not
  // append duplicate <script> tags. A failed load clears the promise (and
  // removes its tag) so a later manual retry can attempt a fresh load.
  if (_peerJSLoadPromise) return _peerJSLoadPromise;
  _peerJSLoadPromise = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "./js/vendor/peerjs.min.js";
    s.onload  = () => res(window.Peer);
    s.onerror = () => {
      _peerJSLoadPromise = null;
      s.remove();
      rej(new Error("Failed to load PeerJS from js/vendor/peerjs.min.js"));
    };
    document.head.appendChild(s);
  });
  return _peerJSLoadPromise;
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
// Base64 of AES-GCM over a max-size JSON payload, plus envelope headroom.
const _SYNC_MAX_WIRE_CHARS = Math.ceil(_SYNC_MAX_MSG_CHARS * 1.4) + 1024;

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
  let n;
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
    // Same policy as app.js's cross-tab `storage` listener: render() rebuilds
    // #view and #modal-root via innerHTML, which drops focus and the caret out
    // of whatever the user is typing (quick capture, a step textarea, the
    // search box). A peer's patch isn't urgent enough to interrupt that — the
    // merged entries are already in state and the next natural render shows
    // them. Only render now when nothing editable has focus.
    if (typeof render === "function" && !_userIsTyping()) render();
  } finally {
    _applyingRemote = false;
  }
}

function _userIsTyping() {
  const ae = document.activeElement;
  if (!ae) return false;
  const tag = ae.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT" || ae.isContentEditable) return true;
  return tag === "INPUT" && !["checkbox", "radio", "range", "button", "submit", "file"].includes(ae.type);
}

// ── Incoming-connection consent banner ───────────────────────────────────────

function syncHideIncomingBanner() {
  const b = document.getElementById("syncIncomingBar");
  if (b) b.remove();
}

function syncShowIncomingBanner(peerLabel) {
  syncHideIncomingBanner();
  const bar = document.createElement("div");
  bar.id = "syncIncomingBar";
  bar.className = "sync-incoming-bar";
  bar.innerHTML =
    '<div class="sync-incoming-inner"><strong>Incoming sync</strong> from device <code>' + _escHtml(peerLabel || "unknown") +
    '</code> — accept only if this is your device. It still has to prove it holds your pairing code before anything is shared.</div>' +
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
  // Defense-in-depth for the lock screen (see the _peer "connection" gate):
  // never complete a pairing while the journal is PIN-locked.
  if (_isLocked()) return;
  const conn = _pendingInboundConn;
  if (!conn) return;
  _pendingInboundConn = null;
  syncHideIncomingBanner();
  const buffered = _takePendingBuffer(conn);
  _dropConn();
  _wireConn(conn, "responder", buffered);
}

function syncRejectInbound() {
  const conn = _pendingInboundConn;
  _pendingInboundConn = null;
  syncHideIncomingBanner();
  _takePendingBuffer(conn);
  if (conn) { try { conn.close(); } catch { /* noop */ } }
}

// While a consent banner is up the channel usually opens and the dialler's
// "hello" arrives before we've wired the connection; an unlistened PeerJS
// "data" event is simply lost. Hold the first few messages so Accept can
// replay them — only handshake-sized ones, since nothing else is legitimate
// before the handshake anyway.
const _PENDING_BUFFER_MAX = 4;
function _bufferPendingData(conn) {
  const buf = { items: [], active: true };
  const onData = (m) => {
    if (!buf.active || buf.items.length >= _PENDING_BUFFER_MAX) return;
    let size;
    try { size = JSON.stringify(m).length; } catch { return; }
    if (size <= 2048) buf.items.push(m);
  };
  buf.stop = () => {
    buf.active = false;
    if (typeof conn.off === "function") { try { conn.off("data", onData); } catch { /* noop */ } }
  };
  conn.on("data", onData);
  conn.__rfrPendingBuf = buf;
}

function _takePendingBuffer(conn) {
  const buf = conn && conn.__rfrPendingBuf;
  if (!buf) return [];
  buf.stop();
  delete conn.__rfrPendingBuf;
  return buf.items;
}

// ── Connection handling ──────────────────────────────────────────────────────

// Drop the live connection deliberately (re-dial, accept-inbound, disconnect,
// handshake failure). Null out _conn BEFORE calling close(): PeerJS emits
// "close" synchronously from close() on an open channel, and _wireConn's close
// handler would otherwise see `_conn === conn`, flip the status to "waiting"
// and schedule an auto-reconnect against _lastDialId — redialing the very
// device we just replaced, and 2s later tearing down whatever replaced it.
function _dropConn() {
  const old = _conn;
  _conn = null;
  if (_readyConn === old) { _readyConn = null; _activeSend = null; }
  if (old && typeof old.__rfrClearTimer === "function") old.__rfrClearTimer();
  if (old) { try { old.close(); } catch { /* noop */ } }
}

// Wire a DataConnection as the live link. `role` is "initiator" for a dial
// we placed and "responder" for an inbound one; the roles fix who sends
// which handshake message. `buffered` replays data that arrived while an
// inbound connection waited on the consent banner.
function _wireConn(conn, role, buffered) {
  _conn = conn;
  const initiator = role === "initiator";
  const sess = {
    step: 0,             // 0: nothing sent/seen; 1: hello sent (initiator) / hello-ack sent (responder)
    ready: false,
    failed: false,
    myNonce: null,       // base64
    peerNonce: null,     // base64
    aadOut: null,
    aadIn: null,
    inbox: Promise.resolve(),
    outbox: Promise.resolve(),
    timer: null,
    stateReplied: false, // one-time state reply, see dispatch()
  };
  const keysPromise = _getKeys();
  keysPromise.catch(() => { /* surfaced by the first handshake step */ });

  const clearTimer = () => { if (sess.timer) { clearTimeout(sess.timer); sess.timer = null; } };
  // Let _dropConn() disarm the handshake timer when it replaces this link;
  // the close handler below is deliberately skipped in that path.
  conn.__rfrClearTimer = clearTimer;

  // Close at once, without answering, and never auto-redial a peer that
  // failed to prove the secret: the user must act (Reconnect / new code).
  const fail = (reason, userMsg) => {
    if (sess.failed) return;
    sess.failed = true;
    clearTimer();
    _recordHandshakeFailure();
    console.warn("[sync] connection rejected:", reason);
    if (_conn === conn) _dropConn();
    else { try { conn.close(); } catch { /* noop */ } }
    if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
    _setSyncStatus("error", userMsg);
    const now = Date.now();
    if (typeof toast === "function" && now - _lastFailToastAt > 5000) {
      _lastFailToastAt = now;
      toast(userMsg, { variant: "error" });
    }
  };

  const armTimeout = () => {
    clearTimer();
    sess.timer = setTimeout(() => {
      if (!sess.ready && _conn === conn) {
        fail("handshake timeout", "Sync pairing timed out — the other device did not answer. Try Connect again.");
      }
    }, SYNC_HANDSHAKE_TIMEOUT_MS);
  };

  // Encrypt-then-send, serialised so messages leave in the order they were
  // queued even though AES-GCM is asynchronous.
  const send = (inner) => {
    sess.outbox = sess.outbox.then(async () => {
      if (_conn !== conn || !sess.ready) return;
      const wire = await _encryptMessage(await keysPromise, sess.aadOut, inner);
      if (_conn === conn && conn.open) conn.send(wire);
    }).catch(e => console.warn("[sync] send", e));
  };

  const becomeReady = () => {
    sess.ready = true;
    clearTimer();
    const iNonce = initiator ? sess.myNonce : sess.peerNonce;
    const rNonce = initiator ? sess.peerNonce : sess.myNonce;
    sess.aadOut = _aadFor(iNonce, rNonce, role);
    sess.aadIn  = _aadFor(iNonce, rNonce, initiator ? "responder" : "initiator");
    _readyConn  = conn;
    _activeSend = send;
    if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
    _reconnectAttempt = 0;
    _onPeerVerified(conn.peer);
    _setSyncStatus("connected");
    send({ type: "state", payload: _packState() });
  };

  // Plain handlers for authenticated, decrypted messages — the pre-v2 logic.
  const dispatch = (inner) => {
    if (inner.type === "state") {
      _mergeState(inner.payload);
      // Reply with our own state once. Both sides send "state" on readiness;
      // answering here makes the first full exchange reliable regardless of
      // which side's readiness fired first.
      if (!sess.stateReplied) {
        sess.stateReplied = true;
        send({ type: "state-reply", payload: _packState() });
      }
    } else if (inner.type === "state-reply" || inner.type === "patch") {
      _mergeState(inner.payload);
    } else if (inner.type === "ping") {
      send({ type: "pong" });
    }
    // Unknown authenticated types are ignored (forward compatibility).
  };

  const handleHandshake = async (msg) => {
    if (["state", "state-reply", "patch", "ping", "pong"].includes(msg.type)) {
      return fail("plaintext from a pre-v2 peer",
        "Sync pairing failed: the other device runs an older version of Rephrame. Update it, then pair again with a new code.");
    }
    if (msg.v !== SYNC_PROTO_V) {
      return fail("protocol version " + String(msg.v),
        "Sync pairing failed: incompatible sync version — update Rephrame on both devices.");
    }
    let keys;
    try { keys = await keysPromise; } catch { return fail("no keys", SYNC_MISMATCH_MSG); }
    if (initiator) {
      if (sess.step !== 1 || msg.type !== "hello-ack") return fail("unexpected " + msg.type, SYNC_MISMATCH_MSG);
      if (!_validNonce(msg.nonce)) return fail("bad responder nonce", SYNC_MISMATCH_MSG);
      if (!(await _verifyProof(keys.mac, "ack", sess.myNonce, msg.proof))) return fail("bad ack proof", SYNC_MISMATCH_MSG);
      if (_conn !== conn || sess.failed) return;
      sess.peerNonce = msg.nonce;
      const proof = await _makeProof(keys.mac, "ok", msg.nonce);
      if (_conn !== conn || sess.failed) return;
      try { conn.send({ type: "hello-ok", v: SYNC_PROTO_V, proof }); }
      catch (e) { return fail("send hello-ok: " + e, "Sync pairing failed: could not answer the other device."); }
      becomeReady();
      return;
    }
    // Responder.
    if (sess.step === 0) {
      if (msg.type !== "hello") return fail("unexpected " + msg.type, SYNC_MISMATCH_MSG);
      if (!_validNonce(msg.nonce)) return fail("bad initiator nonce", SYNC_MISMATCH_MSG);
      sess.peerNonce = msg.nonce;
      sess.myNonce = _newNonce();
      const proof = await _makeProof(keys.mac, "ack", msg.nonce);
      if (_conn !== conn || sess.failed) return;
      sess.step = 1;
      try { conn.send({ type: "hello-ack", v: SYNC_PROTO_V, nonce: sess.myNonce, proof }); }
      catch (e) { return fail("send hello-ack: " + e, "Sync pairing failed: could not answer the other device."); }
      return;
    }
    if (sess.step === 1) {
      if (msg.type !== "hello-ok") return fail("unexpected " + msg.type, SYNC_MISMATCH_MSG);
      if (!(await _verifyProof(keys.mac, "ok", sess.myNonce, msg.proof))) return fail("bad ok proof", SYNC_MISMATCH_MSG);
      if (_conn !== conn || sess.failed) return;
      becomeReady();
      return;
    }
    return fail("handshake state", SYNC_MISMATCH_MSG);
  };

  const handle = async (msg) => {
    if (_conn !== conn || sess.failed) return;
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.type !== "string") {
      return fail("malformed message", SYNC_MISMATCH_MSG);
    }
    if (!sess.ready) return handleHandshake(msg);
    // After readiness nothing but ciphertext is acceptable.
    if (msg.type !== "enc") return fail("plaintext after handshake", SYNC_MISMATCH_MSG);
    if ((typeof msg.ct === "string" && msg.ct.length > _SYNC_MAX_WIRE_CHARS)) return fail("oversized ciphertext", "Sync message too large — rejected.");
    let inner;
    try { inner = await _decryptMessage(await keysPromise, sess.aadIn, msg); }
    catch { return fail("decryption failed", SYNC_MISMATCH_MSG); }
    if (_conn !== conn || sess.failed) return;
    dispatch(inner);
  };

  // Process incoming data strictly in order: handshake steps and decryption
  // are asynchronous, and two messages racing through the state machine
  // could otherwise interleave.
  const onData = (msg) => {
    sess.inbox = sess.inbox
      .then(() => handle(msg))
      .catch(e => { console.warn("[sync] data handler", e); fail("internal error", SYNC_MISMATCH_MSG); });
  };

  // Every handler below checks `_conn === conn` first: when a connection is
  // replaced (re-pair, accepted inbound while dialing), the OLD connection's
  // close/error events fire asynchronously AFTER _conn already points at the
  // new one — without the guard they'd null out the live connection and kill
  // sync silently while the UI still says connected.
  const onOpen = () => {
    if (_conn !== conn) return;
    if (initiator && sess.step === 0) {
      sess.myNonce = _newNonce();
      sess.step = 1;
      try { conn.send({ type: "hello", v: SYNC_PROTO_V, nonce: sess.myNonce }); }
      catch (e) { fail("send hello: " + e, "Sync pairing failed: could not reach the other device."); return; }
    }
    if (!sess.ready) armTimeout();
  };

  conn.on("data", onData);

  conn.on("close", () => {
    if (_conn !== conn) return;
    clearTimer();
    _conn = null;
    _readyConn = null;
    _activeSend = null;
    // A live channel closing must drop "connected" — on the accepting side
    // there's no reconnect loop to correct the label, so leaving it reads
    // as "Synced with …" forever while nothing syncs.
    if (_syncStatus !== "error") _setSyncStatus("waiting");
    if (_lastDialId) _scheduleSyncReconnect();
  });

  conn.on("error", (err) => {
    if (_conn !== conn) return;
    console.warn("[sync] conn error", err);
    clearTimer();
    _conn = null;
    _readyConn = null;
    _activeSend = null;
    if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
    _setSyncStatus("error", _friendlySyncError(err));
    if (_lastDialId) _scheduleSyncReconnect();
  });

  // The responder waits for the dialler's hello from the moment it's wired;
  // the initiator arms its timer when the channel opens and hello goes out.
  if (!initiator) armTimeout();

  // The accepting side often wires the connection only after the user taps
  // "Accept", by which point PeerJS has already fired (and won't re-fire)
  // "open". Detect that and run onOpen now.
  if (conn.open) onOpen();
  else conn.on("open", onOpen);

  // Replay anything that arrived while the consent banner was up.
  for (const m of (buffered || [])) onData(m);
}

// A verified handshake proves the other end holds the secret: remember its
// id so both devices auto-dial each other from now on (the device that
// showed the code learns its partner's id here).
function _onPeerVerified(peerId) {
  if (!_pairing || typeof peerId !== "string" || !peerId) return;
  let changed = false;
  if (_pairing.peer !== peerId) { _pairing.peer = peerId; changed = true; }
  if (!_pairing.verified)       { _pairing.verified = true; changed = true; }
  // The code has done its job: forget the secret this device was showing.
  if (_offerSecret)             { _offerSecret = null; changed = true; }
  if (!changed) return;
  _savePairingRecord();
  renderSyncPanel();
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

function _resolvePeerId() {
  let saved = _myPeerId();
  if (!saved) {
    saved = _genPeerId();
    try { localStorage.setItem(SYNC_PEER_KEY, saved); } catch { /* noop */ }
  }
  return saved;
}

function _destroyPeer() {
  if (!_peer) return;
  const p = _peer;
  _peer = null;
  try { p.destroy(); } catch { /* noop */ }
}

// Resolves true when the peer engine is ready, false when it couldn't (or
// mustn't) start. Callers must check the result — treating a failed init as
// "ready" caused an unbounded syncInit→syncConnect retry loop when peerjs
// was unreachable.
let _syncInitPromise = null;
let _idRetry = 0;
async function syncInit() {
  if (_peer) return true;
  if (_syncInitPromise) return _syncInitPromise;
  // PIN gate: no peer registration and no dial while the journal is locked.
  // The "rephrame:unlocked" listener below starts sync after a good PIN.
  if (_isLocked()) return false;
  // Nothing to register without a v2 pairing — a legacy (secret-less) room
  // or a never-paired device waits for the user to generate a code.
  if (!_pairing) { _setSyncStatus("unpaired"); return false; }
  _syncInitPromise = (async () => {
    _setSyncStatus("loading");

    // The keys must exist before this device answers to anyone. A record
    // without keys (site data partly cleared, storage blocked at pairing
    // time) is retired: without the keys it can neither prove nor verify.
    try { await _getKeys(); }
    catch (e) {
      if (String(e && e.message) === "pairing changed") return false;
      _setPairing(null);
      _setSyncStatus("unpaired", "This device's sync keys are gone (site data was cleared or the browser blocked storage). Generate a new pairing code, or enter the code from your other device.");
      renderSyncPanel();
      return false;
    }
    if (_isLocked() || !_pairing) return false;

    let Peer;
    try { Peer = await _loadPeerJS(); }
    catch { _setSyncStatus("error", "Sync engine unavailable"); return false; }
    if (_isLocked() || !_pairing) return false;

    const myId = _resolvePeerId();

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
      _idRetry = 0;
      _setSyncStatus("waiting");
      // Auto-dial the paired device (both sides do; glare is resolved below).
      if (_pairing && _pairing.peer && !_conn) _dialPeer(_pairing.peer);
    });

    _peer.on("connection", (conn) => {
      if (!_syncEnabled)              { try { conn.close(); } catch { /* noop */ } return; }
      // Never surface (or allow accepting) a consent banner while the PIN
      // lock screen is up — the banner mounts on <body> above the lock
      // overlay, and its Accept button would ship the whole journal to the
      // connecting peer without a PIN ever being entered.
      if (_isLocked())                { try { conn.close(); } catch { /* noop */ } return; }
      if (!_pairing)                  { try { conn.close(); } catch { /* noop */ } return; }
      // Back-off after failed handshakes: close without answering.
      if (_inboundBlocked())          { try { conn.close(); } catch { /* noop */ } return; }
      const known = !!(_pairing.peer && conn.peer === _pairing.peer);
      if (known) {
        // Already paired with this device — no consent banner needed (the
        // handshake still has to succeed before any data flows). Both
        // devices auto-dial each other on boot, so resolve that glare
        // deterministically: the two physical connections converge on the
        // one whose CALLER has the smaller peer id, so both sides agree and
        // no messages are sent into a channel the other side never wired.
        if (_conn && _conn.open) { try { conn.close(); } catch { /* noop */ } return; }
        const dialingThisPeer = _conn && !_conn.open && _lastDialId === conn.peer;
        if (dialingThisPeer && !(conn.peer < myId)) {
          // Our outbound dial is the surviving link; reject the inbound.
          try { conn.close(); } catch { /* noop */ }
          return;
        }
        // Inbound is the surviving link (or there's no competing dial): drop
        // our outbound / any pending inbound and accept this one.
        _dropConn();
        if (_pendingInboundConn) { _takePendingBuffer(_pendingInboundConn); try { _pendingInboundConn.close(); } catch { /* noop */ } _pendingInboundConn = null; }
        syncHideIncomingBanner();
        _wireConn(conn, "responder");
        return;
      }
      if (_conn && _conn.open)        { try { conn.close(); } catch { /* noop */ } return; }
      if (_pendingInboundConn)        { try { conn.close(); } catch { /* noop */ } return; }
      _pendingInboundConn = conn;
      _bufferPendingData(conn);
      conn.on("close", () => { if (_pendingInboundConn === conn) { _pendingInboundConn = null; _takePendingBuffer(conn); syncHideIncomingBanner(); } });
      conn.on("error", () => { if (_pendingInboundConn === conn) { _pendingInboundConn = null; _takePendingBuffer(conn); syncHideIncomingBanner(); } });
      syncShowIncomingBanner(_idToCode(conn.peer));
    });

    _peer.on("error", (err) => {
      console.warn("[sync] peer error", err);
      const t = err && err.type;
      if (t === "unavailable-id") {
        // Another session still holds this device's id on the broker (a tab
        // that just closed, or someone squatting it). Rotating to a fresh id
        // — the pre-v2 behaviour — would silently break the pairing, since
        // the room id IS this device's id; wait and retry instead, and leave
        // "generate a new code" as the explicit escape hatch.
        _destroyPeer();
        _idRetry += 1;
        if (_idRetry <= 3) {
          const wait = 5000 * _idRetry;
          _setSyncStatus("error", "This device's id is busy on the sync broker — retrying in " + Math.round(wait / 1000) + "s.");
          setTimeout(() => { if (_syncEnabled && !_peer) syncInit().then(() => renderSyncPanel()).catch(() => {}); }, wait);
        } else {
          _setSyncStatus("error", "This device's id is in use on the sync broker. Close other Rephrame tabs and Reconnect, or generate a new pairing code.");
        }
        return;
      }
      if (t === "peer-unavailable") {
        // The broker's EXPIRE arrives ~5s after an undeliverable offer and is
        // not tied to a DataConnection; PeerJS only gives us the target id in
        // the message ("Could not connect to peer <id>"). A user who corrected
        // a typo and re-dialed within those seconds has a NEW dial in _conn —
        // an unmatched or unparseable id must not tear that one down.
        const m = /Could not connect to peer (\S+)/.exec(String((err && err.message) || ""));
        const deadId = m ? m[1] : null;
        const isCurrentDial = !!(_conn && !_conn.open && (deadId ? _conn.peer === deadId : true));
        if (!isCurrentDial) return;
        if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
        // The dial never opened, so PeerJS will never emit "close" for it and
        // _wireConn's handlers never run. Drop it here, or _conn keeps pointing
        // at a dead DataConnection: the known-room glare check above would then
        // treat us as "still dialing" and reject the other device's inbound
        // dial (when its id sorts higher) once it comes online — leaving both
        // sides stuck until a manual Reconnect.
        _dropConn();
        _setSyncStatus("error", "Device not found — the other device is offline or the code is mistyped");
        return;
      }
      if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") {
        if (_lastDialId) _scheduleSyncReconnect();
        else _setSyncStatus("error", "Lost connection to matchmaking server — check internet");
        return;
      }
      if (t === "browser-incompatible") {
        _setSyncStatus("error", "Browser does not support WebRTC data channels");
        return;
      }
      _setSyncStatus("error", _friendlySyncError(err));
    });

    const thisPeer = _peer;
    _peer.on("disconnected", () => {
      // destroy() also emits "disconnected" — and does so BEFORE it sets its
      // own `destroyed` flag, so that flag can't be read synchronously here.
      // Re-check on a microtask, once destroy() has finished: a peer we
      // replaced (Disable / new code) or one PeerJS tore down after a fatal
      // error must neither flip the status back to "waiting" (overwriting the
      // error just shown) nor be asked to reconnect.
      queueMicrotask(() => {
        if (_peer !== thisPeer || thisPeer.destroyed) return;
        _setSyncStatus("waiting");
        try { thisPeer.reconnect(); } catch (e) { console.warn("[sync] reconnect", e); }
      });
    });
    return true;
  })();
  try { return await _syncInitPromise; } finally { _syncInitPromise = null; }
}

function _scheduleSyncReconnect() {
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  if (!_lastDialId || !_syncEnabled) {
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
    if (!_syncEnabled || !_lastDialId) return;
    _setSyncStatus("connecting", "Reconnecting (attempt " + _reconnectAttempt + "/" + SYNC_RECONNECT_BACKOFFS_MS.length + ")…");
    try { _dialPeer(_lastDialId); }
    catch (e) { console.warn("[sync] reconnect failed", e); _scheduleSyncReconnect(); }
  }, wait);
}

function syncReconnectNow() {
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  _reconnectAttempt = 0;
  const target = _lastDialId || (_pairing && _pairing.peer);
  if (target) {
    _setSyncStatus("connecting", "Reconnecting…");
    try { _dialPeer(target); } catch (e) { console.warn("[sync] reconnect failed", e); }
  }
}

// Place an outbound dial to a peer id. The pairing secret is proved by the
// handshake in _wireConn before anything else is sent.
function _dialPeer(peerId) {
  if (!_peer) {
    // Only re-enter when init actually produced an engine — recursing on a
    // failed init (e.g. peerjs script unreachable) would spin forever.
    syncInit().then(ok => { if (ok && _peer) _dialPeer(peerId); })
      .catch(e => console.warn("[sync] init failed", e));
    return;
  }
  if (!_pairing) { _setSyncStatus("unpaired"); return; }
  if (peerId === _peer.id) {
    _setSyncStatus("error", "That's this device's own code");
    return;
  }
  _lastDialId = peerId;
  _setSyncStatus("connecting");

  _dropConn();

  const conn = _peer.connect(peerId, { reliable: true });

  if (_connectTimeoutId) clearTimeout(_connectTimeoutId);
  _connectTimeoutId = setTimeout(() => {
    _connectTimeoutId = null;
    // Only act on the dial this timer was armed for — a re-dial may have
    // replaced it in the meantime and be doing fine.
    if (_conn !== conn) return;
    if (!conn.open) {
      // Closing a never-opened DataConnection emits no "close" event, so the
      // _wireConn handlers won't clear _conn for us. Do it here so the dead
      // dial can't block a later inbound connection from this peer.
      _dropConn();
      _setSyncStatus("error",
        "No response — the other device may be on a different network " +
        "(cellular or a restrictive firewall can block peer-to-peer). " +
        "Try again on the same WiFi.");
    }
  }, 20000);

  conn.on("open",  () => { if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; } });
  conn.on("error", () => { if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; } });

  _wireConn(conn, "initiator");
}

// The user typed a pairing code shown on another device: derive the keys
// from it, adopt its room as this device's pairing (replacing whatever it
// had, v2 or legacy) and dial it. The secret is dropped once the keys exist.
async function syncConnect(code) {
  const parsed = _parseCode(code);
  if (!parsed.ok) {
    _setSyncStatus("error", parsed.message);
    return;
  }
  if (parsed.room === _myRoom()) {
    _setSyncStatus("error", "That's this device's own code");
    return;
  }
  const peerId = _roomToId(parsed.room);
  _setSyncStatus("loading");
  let k;
  try { k = await _deriveKeys(parsed.secret, parsed.room); }
  catch (e) { console.warn("[sync] key derivation failed", e); _setSyncStatus("error", "Could not derive sync keys — try again."); return; }
  _clearLegacyPairing();
  _setPairing({ room: parsed.room, peer: peerId, verified: false });
  await _storeKeys(parsed.room, k.aes, k.mac);
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  _reconnectAttempt = 0;
  renderSyncPanel();
  _dialPeer(peerId);
}

// Rotate: fresh room id + secret for this device, old pairing gone. The
// other device must be re-paired with the new code.
function syncRegenerateCode(opts) {
  const hadWorkingPairing = !!(_pairing && _pairing.peer);
  if (!(opts && opts.skipConfirm) && hadWorkingPairing) {
    const msg = "Generate a new pairing code? This unpairs the device that is currently paired with this one — sync stops until you enter the new code on it (or on another device). Continue?";
    if (!confirm(msg)) return;
  }
  // Forget the reconnect target too — a pending backoff timer (or a later
  // error) would otherwise redial the very device the user just unpaired.
  if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  _reconnectAttempt = 0;
  _lastDialId = null;
  if (_pendingInboundConn) { _takePendingBuffer(_pendingInboundConn); try { _pendingInboundConn.close(); } catch { /* noop */ } _pendingInboundConn = null; }
  syncHideIncomingBanner();
  _dropConn();
  _destroyPeer();
  _setPairing(null);
  _setSyncStatus("loading");
  renderSyncPanel();
  return _mintPairing()
    .then(() => { renderSyncPanel(); return syncInit(); })
    .then(() => renderSyncPanel())
    .catch(e => { console.warn("[sync] could not generate a pairing code", e); _setSyncStatus("error", "Could not generate a pairing code — try again."); });
}

function syncDisconnect() {
  if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  _reconnectAttempt = 0;
  _lastDialId = null;
  if (_pendingInboundConn) { _takePendingBuffer(_pendingInboundConn); try { _pendingInboundConn.close(); } catch { /* noop */ } _pendingInboundConn = null; }
  syncHideIncomingBanner();
  _dropConn();
  _destroyPeer();
  _setPairing(null);
  _clearLegacyPairing();
  try { localStorage.removeItem(SYNC_ENABLED_KEY); } catch { /* noop */ }
  _setSyncStatus("off");
  _syncEnabled = false;
  renderSyncPanel();
}

// PIN lock: take the whole engine down while locked, bring it back after a
// successful unlock. app.js dispatches both events.
function _syncOnLocked() {
  if (!_syncEnabled) return;
  if (_connectTimeoutId) { clearTimeout(_connectTimeoutId); _connectTimeoutId = null; }
  if (_reconnectTimerId) { clearTimeout(_reconnectTimerId); _reconnectTimerId = null; }
  _reconnectAttempt = 0;
  if (_pendingInboundConn) { _takePendingBuffer(_pendingInboundConn); try { _pendingInboundConn.close(); } catch { /* noop */ } _pendingInboundConn = null; }
  syncHideIncomingBanner();
  _dropConn();
  _destroyPeer();
  _setSyncStatus("loading");
}

function _syncOnUnlocked() {
  if (!_syncEnabled || _peer) return;
  syncInit().then(() => renderSyncPanel()).catch(e => console.warn("[sync] init failed", e));
}

window.addEventListener("rephrame:locked", _syncOnLocked);
window.addEventListener("rephrame:unlocked", _syncOnUnlocked);

window.addEventListener("beforeunload", () => {
  if (_conn) { try { _conn.close(); } catch { /* noop */ } }
  if (_peer) { try { _peer.destroy(); } catch { /* noop */ } }
});

// ── Broadcast (called from app.js persist) ───────────────────────────────────

let _broadcastTimer  = null;
let _lastBroadcastAt = 0;
let _warnedOversize  = false;
function _linkReady() { return !!(_conn && _conn.open && _readyConn === _conn && _activeSend); }
// Receivers enforce _SYNC_MAX_MSG_CHARS, so a journal past the cap would be
// silently rejected by every peer — "connected" but never converging. Check
// on the sender too and tell the user instead.
function _sendPatch() {
  if (!_linkReady()) return;
  const payload = _packState();
  let size = 0;
  try { size = JSON.stringify(payload).length; } catch { /* send anyway */ }
  if (size > _SYNC_MAX_MSG_CHARS) {
    if (!_warnedOversize) {
      _warnedOversize = true;
      console.warn("[sync] journal exceeds the sync payload cap; not broadcasting");
      if (typeof toast === "function") {
        toast("Journal is too large to sync between devices — use Export/Import for backups.", { variant: "error" });
      }
    }
    return;
  }
  _warnedOversize = false;
  try { _activeSend({ type: "patch", payload }); } catch (e) { console.warn("[sync] broadcast", e); }
}
function syncBroadcast() {
  if (_applyingRemote) return;          // don't echo a merge back to the peer
  if (!_linkReady()) return;            // nothing leaves before the handshake
  const now = Date.now();
  if (now - _lastBroadcastAt < 500) {   // throttle: ≤1 broadcast / 500ms
    clearTimeout(_broadcastTimer);
    _broadcastTimer = setTimeout(() => {
      _lastBroadcastAt = Date.now();
      _broadcastTimer = null;
      _sendPatch();
    }, 500);
    return;
  }
  _lastBroadcastAt = now;
  _sendPatch();
}

// ── Panel UI ─────────────────────────────────────────────────────────────────
// Self-contained: builds #syncPanel's innerHTML and wires its own listeners,
// so it doesn't depend on app.js's per-render querySelectorAll wiring. Called
// from bindModal() whenever the Settings modal is rendered.

function _renderSyncActionRow() {
  const row = document.getElementById("syncActionRow");
  if (!row) return;
  const canRetry = _lastDialId || (_pairing && _pairing.peer);
  if (canRetry && (_syncStatus === "error" || _reconnectTimerId)) {
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

  // Legacy pairing (pre-v2, no secret): nothing is dialled or accepted until
  // a new code exists. One-time notice — it disappears with the old record.
  if (_hasLegacyPairing()) {
    panel.innerHTML =
      '<div class="sync-active">' +
        '<div class="sync-status-row"><span class="sync-dot sync-dot--unpaired" id="syncDot"></span><span id="syncStatus">Sync paused — re-pairing needed</span></div>' +
        '<p class="settings-section-help"><strong>Security update:</strong> pairing codes now include a secret that both devices must prove they hold before anything is shared, and every sync message is encrypted with a key derived from it. Your existing pairing predates this and has been retired. Update Rephrame on your other device, generate a new pairing code here, and enter it there.</p>' +
        '<div class="sync-code-actions">' +
          '<button class="btn btn-primary sync-btn-sm" id="syncRegenBtn">Generate new pairing code</button>' +
        '</div>' +
        '<button class="btn btn-ghost sync-btn-sm sync-disable" id="syncDisableBtn">Disable sync</button>' +
      '</div>';
    const regenBtn = document.getElementById("syncRegenBtn");
    if (regenBtn) regenBtn.onclick = () => syncRegenerateCode({ skipConfirm: true });
    const disableBtn = document.getElementById("syncDisableBtn");
    if (disableBtn) disableBtn.onclick = () => syncDisconnect();
    return;
  }

  // Preserve a half-typed pairing code across re-renders. renderSyncPanel
  // runs on every app render while Settings is open (theme tap, an incoming
  // P2P patch, a cross-tab write), and rebuilding innerHTML would otherwise
  // blank the input mid-entry and re-disable Connect.
  const prevInput = document.getElementById("syncCodeInput");
  const prevCode = prevInput ? prevInput.value : "";
  const prevFocused = prevInput && document.activeElement === prevInput;

  const host = _isPairingHost();
  const paired = !!(_pairing && _pairing.peer);
  const volatileHint = _keysVolatile
    ? '<div class="sync-input-hint sync-input-hint--err">Your browser refused persistent storage, so this pairing will not survive a reload — you will need a new code next time.</div>'
    : '';
  let pairingBlock;
  if (_pairing && host && !paired && _offerSecret) {
    // The secret is shown here and only here: it lives in memory until a
    // device pairs or the page is closed, and is never written to storage.
    pairingBlock =
      '<div class="sync-my-code-block">' +
        '<label>Your pairing code</label>' +
        '<div class="sync-code sync-code--long" id="syncMyCode">' + _escHtml(_formatCode(_pairing.room, _offerSecret)) + '</div>' +
        '<div class="sync-input-hint">Enter this code on your other device. It contains a secret: share it only with your own devices, and never over a channel someone else can read. It is shown only now — it disappears once a device has paired or this page is closed.</div>' +
        volatileHint +
        '<div class="sync-code-actions">' +
          '<button class="btn btn-ghost sync-btn-sm" id="syncCopyBtn">Copy</button>' +
          '<button class="btn btn-ghost sync-btn-sm" id="syncRegenBtn" title="Mint a new pairing code (the old one stops working)">Generate new code</button>' +
        '</div>' +
      '</div>';
  } else if (_pairing && host && !paired) {
    // Generated in an earlier session: the keys are still here (a device
    // that already typed the code can still pair) but the code is not.
    pairingBlock =
      '<div class="sync-my-code-block">' +
        '<label>Your pairing code</label>' +
        '<div class="sync-input-hint">The pairing code is only shown right after it is generated, and this device no longer holds it. It is still listening for a device that already entered it; to pair another device, generate a new code.</div>' +
        volatileHint +
        '<div class="sync-code-actions">' +
          '<button class="btn btn-primary sync-btn-sm" id="syncRegenBtn" title="Mint a new pairing code (the old one stops working)">Generate new pairing code</button>' +
        '</div>' +
      '</div>';
  } else if (_pairing) {
    const label = _idToCode(_pairing.peer || _roomToId(_pairing.room));
    const verified = !!_pairing.verified;
    pairingBlock =
      '<div class="sync-my-code-block">' +
        '<label>' + (verified ? "Paired with device" : "Pairing with device") + '</label>' +
        '<div class="sync-code" id="syncMyCode">' + _escHtml(label) + '</div>' +
        '<div class="sync-input-hint">' + (verified
          ? "Both devices hold keys derived from the pairing secret; sync messages are end-to-end encrypted with them."
          : "Waiting for the first connection to verify the pairing code.") +
          ' To pair a different device, generate a new pairing code — that unpairs this one.</div>' +
        volatileHint +
        '<div class="sync-code-actions">' +
          '<button class="btn btn-ghost sync-btn-sm" id="syncRegenBtn" title="Mint a new pairing code (unpairs the current device)">Generate new pairing code</button>' +
        '</div>' +
      '</div>';
  } else if (_mintPromise) {
    pairingBlock =
      '<div class="sync-my-code-block">' +
        '<label>Your pairing code</label>' +
        '<div class="sync-input-hint">Generating your pairing code…</div>' +
      '</div>';
  } else {
    pairingBlock =
      '<div class="sync-my-code-block">' +
        '<label>Your pairing code</label>' +
        '<div class="sync-code-actions">' +
          '<button class="btn btn-primary sync-btn-sm" id="syncRegenBtn">Generate pairing code</button>' +
        '</div>' +
      '</div>';
  }

  panel.innerHTML =
    '<div class="sync-active">' +
      '<div class="sync-status-row"><span class="sync-dot sync-dot--' + _syncStatus + '" id="syncDot"></span><span id="syncStatus"></span></div>' +
      pairingBlock +
      '<div class="sync-connect-block">' +
        '<label>' + (paired ? "Pair with a different device" : "Or enter a code from another device") + '</label>' +
        '<div class="sync-input-row">' +
          '<input id="syncCodeInput" type="text" placeholder="XXX-XXX-XXXX-XXXX-XXXX" maxlength="30" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
          '<button class="btn btn-primary sync-btn-sm" id="syncConnectBtn" disabled>Connect</button>' +
        '</div>' +
        '<div class="sync-input-hint" id="syncInputHint">Enter the ' + CODE_LEN + '-character pairing code shown on the other device. Dashes and letter case don\'t matter.</div>' +
      '</div>' +
      '<div class="sync-action-row" id="syncActionRow"></div>' +
      '<button class="btn btn-ghost sync-btn-sm sync-disable" id="syncDisableBtn">Disable sync</button>' +
    '</div>';

  const copyBtn = document.getElementById("syncCopyBtn");
  if (copyBtn) copyBtn.onclick = () => {
    const code = (_pairing && host && !paired && _offerSecret) ? _formatCode(_pairing.room, _offerSecret) : "";
    if (navigator.clipboard && code) {
      navigator.clipboard.writeText(code)
        .then(() => { if (typeof toast === "function") toast("Pairing code copied"); })
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
    // Restore any text the user was mid-typing before this re-render, and
    // re-derive the Connect button / hint state from it.
    if (prevCode) {
      input.value = prevCode;
      syncOnCodeInput(input);
      if (prevFocused) {
        input.focus();
        try { const n = input.value.length; input.setSelectionRange(n, n); } catch { /* noop */ }
      }
    }
  }
  if (connectBtn) connectBtn.onclick = () => syncConnectFromInput();

  _renderSyncActionRow();
  _setSyncStatus(_syncStatus);
}

// Live-format typed input as XXX-XXX-XXXX-XXXX-XXXX (the "RFR" display prefix
// of older codes is tolerated and stripped).
function syncOnCodeInput(el) {
  if (!el) return;
  let compact = String(el.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // A room id can legitimately start with the letters R-F-R, so only treat
  // them as the old display prefix once the text is longer than a code.
  if (compact.startsWith(CODE_BRAND) && compact.length > CODE_LEN) compact = compact.slice(CODE_BRAND.length);
  compact = compact.slice(0, CODE_LEN);
  const groups = [3, 3, 4, 4, 4];
  let formatted = "", at = 0;
  for (const g of groups) {
    if (at >= compact.length) break;
    if (formatted) formatted += "-";
    formatted += compact.slice(at, at + g);
    at += g;
  }
  // Only rewrite the field when formatting actually changed it — rewriting
  // unconditionally jumps the caret to the end on every keystroke, which
  // makes fixing a typo mid-code painful on mobile keyboards.
  if (el.value !== formatted) el.value = formatted;

  const btn  = document.getElementById("syncConnectBtn");
  const hint = document.getElementById("syncInputHint");
  const parsed = _parseCode(formatted);
  const ok = parsed.ok;
  if (btn) btn.disabled = !ok;
  if (hint) {
    if (!compact) {
      hint.textContent = "Enter the " + CODE_LEN + "-character pairing code shown on the other device. Dashes and letter case don't matter.";
      hint.classList.remove("sync-input-hint--err");
    } else if (!ok) {
      const n = _normalizeCode(formatted).length;
      // A typed "RFR-…" prefix marks an old-format code unambiguously; a bare
      // 6-character prefix is just a new code still being typed.
      const legacyTyped = parsed.legacy && compact.startsWith(CODE_BRAND);
      hint.textContent = legacyTyped ? parsed.message
        : n < CODE_LEN ? ("Keep typing — " + n + "/" + CODE_LEN + " characters so far.") : parsed.message;
      hint.classList.add("sync-input-hint--err");
    } else {
      hint.textContent = "Ready — press Connect.";
      hint.classList.remove("sync-input-hint--err");
    }
  }
}

function syncEnable() {
  _syncEnabled = true;
  // Persist so pairing survives a reload: without this the in-memory flag
  // resets to false on every launch and the auto-dial in _peer.on("open")
  // is never reached, so paired devices silently stop syncing until the
  // user re-clicks "Enable sync" on both.
  try { localStorage.setItem(SYNC_ENABLED_KEY, "1"); } catch { /* noop */ }
  // A device with neither a v2 pairing nor a legacy one gets its code now.
  // A legacy pairing waits for the user to read the notice and generate one.
  if (!_pairing && !_hasLegacyPairing()) {
    _setSyncStatus("loading");
    renderSyncPanel();
    _mintPairing()
      .then(() => { renderSyncPanel(); return syncInit(); })
      .then(() => renderSyncPanel())
      .catch(e => { console.warn("[sync] could not generate a pairing code", e); _setSyncStatus("error", "Could not generate a pairing code — try again."); });
    return;
  }
  if (!_pairing) _setSyncStatus("unpaired");
  renderSyncPanel();
  if (_pairing) syncInit().then(() => renderSyncPanel()).catch(e => console.warn("[sync] init failed", e));
}

function syncConnectFromInput() {
  const val = (document.getElementById("syncCodeInput")?.value || "").trim();
  const parsed = _parseCode(val);
  if (!parsed.ok) {
    _setSyncStatus("error", parsed.message);
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

  // Pure-logic hooks for the headless test walks (tests/sync.mjs,
  // tests/regressions.mjs) and the Node crypto test (tests/sync-crypto.test.mjs).
  // The merge, payload-validation, timestamp-clamp, code-parsing, key-
  // derivation and handshake paths are the highest-risk part of P2P sync but
  // normally only reachable through a live two-peer WebRTC session, which
  // can't run in CI. No production code reads this object; it's inert unless
  // a test calls in. Nothing here reads a stored secret — none is stored.
  window.__syncTestHooks = {
    mergeState:     _mergeState,
    payloadInvalid: _payloadInvalid,
    clampTs:        _clampSyncTs,
    entryTs:        _entryTs,
    SYNC_VERSION,
    SYNC_PROTO_V,
    MAX_ENTRIES:    _SYNC_MAX_ENTRIES,
    CODE_ALPHABET,
    parseCode:      _parseCode,
    normalizeCode:  _normalizeCode,
    formatCode:     _formatCode,
    randomCode:     _randomCode,
    deriveKeys:     _deriveKeys,
    makeProof:      _makeProof,
    verifyProof:    _verifyProof,
    ctEqual:        _ctEqual,
    aadFor:         _aadFor,
    encrypt:        _encryptMessage,
    decrypt:        _decryptMessage,
    // Connection-lifecycle hooks: drive syncConnect against a stubbed
    // window.Peer. Returns a snapshot of the private connection state (never
    // the live objects' methods, never the secret).
    connect:        syncConnect,
    enable:         syncEnable,
    acceptInbound:  syncAcceptInbound,
    rejectInbound:  syncRejectInbound,
    regenerateCode: () => syncRegenerateCode({ skipConfirm: true }),
    resetHandshakeThrottle: () => { _hsFailTimes = []; _hsBlockedUntil = 0; },
    // Install a pairing exactly the way a typed or generated code would: the
    // secret only ever becomes keys. Lets a test seed a device without
    // writing a secret anywhere.
    installPairing: async ({ room, secret, peer, verified }) => {
      const k = await _deriveKeys(secret, room);
      _clearLegacyPairing();
      _setPairing({ room, peer: peer || null, verified: !!verified });
      await _storeKeys(room, k.aes, k.mac);
    },
    // The code this device is currently offering (what the panel shows), or
    // null once a device has paired / after a reload.
    offerCode:      () => (_pairing && _offerSecret) ? _formatCode(_pairing.room, _offerSecret) : null,
    connState:      () => ({
      conn: _conn,
      status: _syncStatus,
      statusMsg: _syncStatusMsg,
      ready: _linkReady(),
      reconnectScheduled: _reconnectTimerId !== null,
      pairing: _pairing ? { room: _pairing.room, peer: _pairing.peer, verified: _pairing.verified } : null,
      legacy: _hasLegacyPairing(),
      keysVolatile: _keysVolatile,
      hasOffer: !!_offerSecret,
      peer: _peer,
    }),
  };

  // Restore a previously-enabled sync session on boot. syncEnable() sets
  // _syncEnabled and calls syncInit(), whose _peer.on("open") handler
  // re-dials the paired device — so paired devices reconnect automatically
  // instead of going dark until a manual re-enable. Behind a PIN lock,
  // syncInit() declines and the "rephrame:unlocked" listener starts it.
  // Never register a peer from inside another site's frame (see the
  // clickjacking guard in js/pwa.js; app.js refuses to boot there too).
  _pairing = _loadPairing();
  let _wasEnabled = false;
  try { _wasEnabled = localStorage.getItem(SYNC_ENABLED_KEY) === "1"; } catch { /* noop */ }
  if (_wasEnabled && window.top === window.self) syncEnable();
}
