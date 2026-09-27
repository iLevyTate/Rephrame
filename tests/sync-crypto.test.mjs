// Node-only exercise of js/sync.js's pairing + wire protocol: no browser, no
// network. The real sync.js source is loaded into a vm sandbox with stubs for
// the DOM, localStorage and PeerJS it touches, so what runs is the shipped
// code. Covers pairing-code parsing, PBKDF2 key derivation, HMAC proofs and
// AES-GCM round trips, and — with several sandboxes wired through a fake
// PeerJS broker — the full hello / hello-ack / hello-ok handshake, the
// encrypted state exchange, rejection of wrong secrets, plaintext, wrong
// versions and pre-v2 peers, the inbound back-off, the legacy-pairing lockout,
// code rotation and the PIN gate.
//
// Runs in CI (.github/workflows/smoke.yml) and locally via `npm run crypto`
// (node --test). No server needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = readFileSync(path.resolve(import.meta.dirname, '..', 'js', 'sync.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label, ms = 8000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + label);
    await sleep(5);
  }
}
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
// Values born inside a vm sandbox carry that realm's prototypes, which strict
// deepEqual rejects; compare their JSON shape instead.
const plain = (v) => JSON.parse(JSON.stringify(v));
const randomNonce = () => b64(crypto.getRandomValues(new Uint8Array(16)));

function makeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// A fake PeerJS broker shared by every sandbox in a test: peers register by
// id, connect() delivers a mirrored DataConnection to the target on the next
// tick, and every message crossing the wire is recorded so a test can assert
// on exactly what the other end could have seen.
function makeBroker() {
  const peers = new Map();
  const wire = [];
  const clone = (m) => JSON.parse(JSON.stringify(m));
  class Emitter {
    constructor() { this._h = {}; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
    off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter((f) => f !== fn); return this; }
    emit(ev, ...a) { for (const fn of [...(this._h[ev] || [])]) fn(...a); }
  }
  class FakeConn extends Emitter {
    constructor(localId, remoteId) {
      super();
      this._localId = localId; this.peer = remoteId;
      this.open = false; this.closed = false; this.remote = null;
    }
    send(msg) {
      if (!this.open) throw new Error('send on a connection that is not open');
      wire.push({ from: this._localId, to: this.peer, msg: clone(msg) });
      const r = this.remote;
      setTimeout(() => { if (r && r.open) r.emit('data', clone(msg)); }, 0);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      const wasOpen = this.open;
      this.open = false;
      const r = this.remote;
      if (wasOpen) this.emit('close');
      if (r && !r.closed) setTimeout(() => r.close(), 0);
    }
  }
  class FakePeer extends Emitter {
    constructor(id) {
      super();
      this.id = id; this.destroyed = false;
      if (peers.has(id)) { setTimeout(() => this.emit('error', { type: 'unavailable-id' }), 0); return; }
      peers.set(id, this);
      setTimeout(() => this.emit('open', id), 0);
    }
    connect(targetId) {
      const local = new FakeConn(this.id, targetId);
      setTimeout(() => {
        const target = peers.get(targetId);
        if (!target || target.destroyed) {
          this.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + targetId });
          return;
        }
        const remote = new FakeConn(targetId, this.id);
        local.remote = remote; remote.remote = local;
        target.emit('connection', remote);
        setTimeout(() => { remote.open = true; local.open = true; remote.emit('open'); local.emit('open'); }, 0);
      }, 0);
      return local;
    }
    destroy() { this.destroyed = true; if (peers.get(this.id) === this) peers.delete(this.id); this.emit('disconnected'); }
    reconnect() {}
  }
  return { FakePeer, wire, peers };
}

// Load js/sync.js into a fresh sandbox standing in for one device.
function loadSync({ storage = makeStorage(), Peer, state = { entries: [] }, globals = {} } = {}) {
  const log = [];
  const toasts = [];
  const listeners = {};
  const el = () => ({ innerHTML: '', textContent: '', className: '', remove() {}, appendChild() {} });
  const sandbox = {
    console: { log: (...a) => log.push(a), warn: (...a) => log.push(a), error: (...a) => log.push(a) },
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder, atob, btoa, Uint8Array, ArrayBuffer,
    setTimeout, clearTimeout, queueMicrotask,
    localStorage: storage,
    navigator: {},
    document: { getElementById: () => null, createElement: el, body: { appendChild() {} }, head: { appendChild() {} }, activeElement: null },
    state,
    persist() {},
    render() {},
    toast(m) { toasts.push(String(m)); },
    ...globals,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  if (Peer) sandbox.Peer = Peer;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'js/sync.js' });
  const dispatch = (ev) => { for (const fn of listeners[ev] || []) fn(); };
  return { sb: sandbox, hooks: sandbox.__syncTestHooks, storage, state, toasts, log, dispatch };
}

const pairingOf = (dev) => JSON.parse(dev.storage.getItem('rephrame_sync_pair_v2'));
const peerOf = (dev) => dev.hooks.connState().peer;
const entry = (id, body, updatedAt) => ({ id, kind: 'freeform', createdAt: '2024-01-01T00:00:00.000Z', updatedAt, body });
// Boot a sandbox as a sync-enabled device on the shared broker.
const bootDevice = (broker, opts = {}) => loadSync({
  storage: opts.storage || makeStorage({ rephrame_sync_enabled: '1' }),
  Peer: broker.FakePeer,
  state: { entries: opts.entries || [] },
  globals: opts.globals,
});

test('pairing codes: parse, normalise and format', () => {
  const { hooks } = loadSync();
  assert.equal(hooks.CODE_ALPHABET, '0123456789ABCDEFGHJKMNPQRSTVWXYZ', 'Crockford base32: no I, L, O, U');
  const code = hooks.formatCode('AB3C9D', '0123456789AB');
  assert.equal(code, 'AB3-C9D-0123-4567-89AB');
  for (const v of [code, 'ab3c9d0123456789ab', 'AB3C9D 0123 4567 89AB', 'rfr-ab3-c9d-0123-4567-89ab', ' ab3-c9d-0123-4567-89ab ']) {
    assert.deepEqual(plain(hooks.parseCode(v)), { ok: true, room: 'AB3C9D', secret: '0123456789AB' }, 'accepts ' + JSON.stringify(v));
  }
  // Crockford look-alikes fold: I/L → 1, O → 0.
  assert.deepEqual(plain(hooks.parseCode('ABICOD-OI23-4567-89AB')), { ok: true, room: 'AB1C0D', secret: '0123456789AB' });
  // Old 6-character codes are refused with a specific message, never treated as a room.
  const legacy = hooks.parseCode('RFR-AB3-C9D');
  assert.equal(legacy.ok, false);
  assert.equal(legacy.legacy, true);
  assert.match(legacy.message, /older version/);
  assert.equal(hooks.parseCode('AB3C9D').legacy, true);
  assert.equal(hooks.parseCode('AB3C9D0123456789A').ok, false, '17 chars');
  assert.equal(hooks.parseCode('AB3C9D0123456789ABC').ok, false, '19 chars');
  assert.equal(hooks.parseCode('AB3C9D0123456789AU').ok, false, 'U is not in the alphabet');
  assert.equal(hooks.parseCode('').ok, false);
  assert.equal(hooks.parseCode(null).ok, false);
  // A room that happens to start with the letters R-F-R is not mangled.
  assert.deepEqual(plain(hooks.parseCode('RFRABC0123456789AB')), { ok: true, room: 'RFRABC', secret: '0123456789AB' });
  assert.deepEqual(plain(hooks.parseCode('RFR-RFRABC0123456789AB')), { ok: true, room: 'RFRABC', secret: '0123456789AB' });
  for (let i = 0; i < 20; i++) {
    const s = hooks.randomCode(12);
    assert.equal(s.length, 12);
    assert.ok([...s].every((c) => hooks.CODE_ALPHABET.includes(c)), 'random codes stay inside the alphabet');
  }
});

test('key derivation is deterministic per (secret, room) and HMAC proofs round-trip', async () => {
  const { hooks } = loadSync();
  const a = await hooks.deriveKeys('0123456789AB', 'AB3C9D');
  const b = await hooks.deriveKeys('0123456789AB', 'AB3C9D');
  const otherSecret = await hooks.deriveKeys('0123456789AC', 'AB3C9D');
  const otherRoom = await hooks.deriveKeys('0123456789AB', 'AB3C9E');
  const nonce = randomNonce();
  const p1 = await hooks.makeProof(a.mac, 'ack', nonce);
  assert.equal(p1, await hooks.makeProof(b.mac, 'ack', nonce), 'same secret + room → same proof');
  assert.equal(Buffer.from(p1, 'base64').length, 32, 'proof is a 32-byte HMAC-SHA256');
  assert.equal(await hooks.verifyProof(a.mac, 'ack', nonce, p1), true);
  assert.equal(await hooks.verifyProof(a.mac, 'ok', nonce, p1), false, 'label is bound');
  assert.equal(await hooks.verifyProof(a.mac, 'ack', randomNonce(), p1), false, 'nonce is bound');
  assert.notEqual(await hooks.makeProof(otherSecret.mac, 'ack', nonce), p1, 'different secret → different proof');
  assert.notEqual(await hooks.makeProof(otherRoom.mac, 'ack', nonce), p1, 'room salts the derivation');
  assert.equal(await hooks.verifyProof(a.mac, 'ack', nonce, 'not base64!'), false);
  assert.equal(await hooks.verifyProof(a.mac, 'ack', nonce, btoa('short')), false);
  assert.equal(await hooks.verifyProof(a.mac, 'ack', nonce, undefined), false);
  assert.equal(hooks.ctEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(hooks.ctEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  assert.equal(hooks.ctEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2])), false);
  assert.equal(hooks.ctEqual(null, new Uint8Array([1])), false);
});

test('AES-GCM transport round-trips and rejects tampering, wrong keys, wrong direction and plaintext', async () => {
  const { hooks } = loadSync();
  const keys = await hooks.deriveKeys('0123456789AB', 'AB3C9D');
  const wrong = await hooks.deriveKeys('0123456789AC', 'AB3C9D');
  const aadOut = hooks.aadFor('n1', 'n2', 'initiator');
  const aadIn = hooks.aadFor('n1', 'n2', 'responder');
  const inner = { type: 'state', payload: { syncV: 1, entries: [entry('e1', 'private thought', 1)], entryDels: {} } };
  const wire = await hooks.encrypt(keys, aadOut, inner);
  assert.equal(wire.type, 'enc');
  assert.equal(wire.v, 2);
  assert.equal(Buffer.from(wire.iv, 'base64').length, 12, '96-bit IV');
  assert.ok(!JSON.stringify(wire).includes('private thought'), 'ciphertext carries no plaintext');
  assert.deepEqual(plain(await hooks.decrypt(keys, aadOut, wire)), inner);
  await assert.rejects(hooks.decrypt(wrong, aadOut, wire), 'wrong key');
  await assert.rejects(hooks.decrypt(keys, aadIn, wire), 'direction is bound through the AAD');
  const flip = (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  await assert.rejects(hooks.decrypt(keys, aadOut, { ...wire, ct: flip(wire.ct) }), 'tampered ciphertext');
  await assert.rejects(hooks.decrypt(keys, aadOut, { ...wire, v: 1 }), 'version pinned');
  await assert.rejects(hooks.decrypt(keys, aadOut, { ...wire, iv: btoa('short') }), 'iv length checked');
  await assert.rejects(hooks.decrypt(keys, aadOut, { type: 'state', payload: {} }), 'plaintext is never accepted');
  const again = await hooks.encrypt(keys, aadOut, inner);
  assert.notEqual(again.iv, wire.iv, 'fresh IV per message');
  assert.notEqual(again.ct, wire.ct);
});

test('two devices pair, prove the secret both ways and exchange only ciphertext', async () => {
  const broker = makeBroker();
  const A = bootDevice(broker, { entries: [entry('a1', 'from A', 100)] });
  await until(() => peerOf(A), 'A peer');
  const pairA = pairingOf(A);
  assert.equal(pairA.secret.length, 12);
  assert.equal(pairA.peer, null, 'a freshly minted pairing knows no partner yet');
  assert.equal(peerOf(A).id, 'rephrame-' + pairA.room.toLowerCase(), 'the room id is the host device id');
  const code = A.hooks.formatCode(pairA.room, pairA.secret);

  const B = bootDevice(broker, { entries: [entry('b1', 'from B', 100)] });
  await until(() => peerOf(B), 'B peer');
  assert.notEqual(peerOf(B).id, peerOf(A).id);

  // B enters A's code: it stores the same room + secret and dials A.
  B.hooks.connect(code);
  assert.equal(pairingOf(B).room, pairA.room);
  assert.equal(pairingOf(B).secret, pairA.secret);
  assert.equal(pairingOf(B).peer, peerOf(A).id);
  // A shows the consent banner for the unknown device; nothing is wired yet
  // and the hello that arrived meanwhile is held, not lost.
  await until(() => broker.wire.some((m) => m.msg.type === 'hello'), 'B hello');
  await sleep(20);
  assert.equal(A.hooks.connState().conn, null, 'A has not wired the inbound connection before Accept');
  assert.equal(broker.wire.length, 1, 'only the hello has crossed the wire while the banner is up');
  A.hooks.acceptInbound();
  await until(() => A.hooks.connState().ready && B.hooks.connState().ready, 'both ready');
  await until(() => A.state.entries.length === 2 && B.state.entries.length === 2, 'full-state merge');
  const types = broker.wire.map((m) => m.msg.type);
  assert.deepEqual(types.slice(0, 3), ['hello', 'hello-ack', 'hello-ok'], 'handshake transcript');
  assert.ok(types.slice(3).length >= 2 && types.slice(3).every((t) => t === 'enc'), 'everything after the handshake is enc: ' + types.join(','));
  assert.ok(!/from A|from B|entries|entryDels|"state"/.test(JSON.stringify(broker.wire)), 'no journal content in plaintext on the wire');
  assert.deepEqual(plain(A.state.entries.map((e) => e.id).sort()), ['a1', 'b1']);
  assert.deepEqual(plain(B.state.entries.map((e) => e.id).sort()), ['a1', 'b1']);
  assert.equal(A.hooks.connState().status, 'connected');
  assert.equal(B.hooks.connState().status, 'connected');
  assert.equal(pairingOf(A).peer, peerOf(B).id, 'A learned B\'s id from the verified handshake');
  assert.equal(pairingOf(A).verified, true);
  assert.equal(pairingOf(B).verified, true);

  // A later save broadcasts an encrypted patch that B merges.
  const before = broker.wire.length;
  A.state.entries.push(entry('a2', 'later from A', 200));
  A.sb.syncBroadcast();
  await until(() => B.state.entries.some((e) => e.id === 'a2'), 'patch merged');
  const later = broker.wire.slice(before);
  assert.ok(later.length >= 1 && later.every((m) => m.msg.type === 'enc'), 'patches are encrypted');
  assert.ok(!JSON.stringify(later).includes('later from A'));
});

test('a device holding the wrong secret is closed by the dialler and receives nothing', async () => {
  const broker = makeBroker();
  const A = bootDevice(broker, { entries: [entry('a1', 'from A', 100)] });
  await until(() => peerOf(A), 'A peer');
  const pairA = pairingOf(A);
  const wrongSecret = pairA.secret.slice(0, 11) + (pairA.secret.endsWith('A') ? 'B' : 'A');
  const C = bootDevice(broker);
  await until(() => peerOf(C), 'C peer');
  C.hooks.connect(A.hooks.formatCode(pairA.room, wrongSecret));
  await until(() => broker.wire.some((m) => m.msg.type === 'hello'), 'hello');
  await sleep(20);
  A.hooks.acceptInbound();
  // A answers with a proof C cannot verify; C closes at once.
  await until(() => C.hooks.connState().status === 'error', 'C error');
  assert.match(C.hooks.connState().statusMsg, /codes do not match/);
  assert.ok(C.toasts.some((t) => /codes do not match/.test(t)), 'the user is told');
  assert.equal(C.hooks.connState().conn, null);
  assert.equal(C.hooks.connState().reconnectScheduled, false, 'no auto-redial after a failed handshake');
  await until(() => A.hooks.connState().conn === null, 'A dropped the link');
  assert.deepEqual(broker.wire.map((m) => m.msg.type), ['hello', 'hello-ack'], 'nothing beyond the handshake crossed the wire');
  assert.equal(A.hooks.connState().ready, false);
  assert.equal(pairingOf(A).peer, null, 'A did not adopt the device as its partner');
  assert.equal(C.state.entries.length, 0);
});

test('a squatter on the host id cannot get past hello; a responder refuses bad proofs, plaintext, wrong versions and then backs off', async () => {
  const broker = makeBroker();
  const room = 'AB3C9D', secret = '0123456789AB';
  // A raw peer squatting the host id that a paired guest auto-dials on boot.
  const squatter = new broker.FakePeer('rephrame-ab3c9d');
  const seen = [];
  squatter.on('connection', (c) => {
    c.on('data', (m) => {
      seen.push(m);
      if (m.type === 'hello') c.send({ type: 'hello-ack', v: 2, nonce: m.nonce, proof: b64(new Uint8Array(32)) });
    });
  });
  const G = bootDevice(broker, {
    entries: [entry('g1', 'guest secret entry', 100)],
    storage: makeStorage({
      rephrame_sync_enabled: '1',
      rephrame_peer_id_v1: 'rephrame-guest1',
      rephrame_sync_pair_v2: JSON.stringify({ room, secret, peer: 'rephrame-ab3c9d', verified: true }),
    }),
  });
  await until(() => G.hooks.connState().status === 'error', 'guest rejects the squatter');
  assert.match(G.hooks.connState().statusMsg, /codes do not match/);
  assert.deepEqual(seen.map((m) => m.type), ['hello'], 'the squatter received nothing but the hello');
  assert.ok(!JSON.stringify(seen).includes('guest secret entry'));
  assert.equal(G.hooks.connState().reconnectScheduled, false, 'no auto-redial');

  // Now a raw peer dials a real device (H hosts a room; the raw peer is
  // unknown, so H shows the banner and the test taps Accept).
  const H = bootDevice(broker, { entries: [entry('h1', 'host secret entry', 100)] });
  await until(() => peerOf(H), 'H peer');
  const raw = new broker.FakePeer('rephrame-rawdial');
  await until(() => broker.peers.has('rephrame-rawdial'), 'raw registered');
  const dialH = () => { const got = []; const c = raw.connect(peerOf(H).id); c.on('data', (m) => got.push(m)); return { c, got }; };

  // (a) pre-v2 plaintext before any handshake, held while the banner is up.
  let { c, got } = dialH();
  await until(() => c.open, 'open a');
  c.send({ type: 'state', payload: { syncV: 1, entries: [], entryDels: {} } });
  await sleep(20);
  H.hooks.acceptInbound();
  await until(() => c.closed, 'closed a');
  assert.equal(got.length, 0, 'a pre-v2 peer gets no answer');
  assert.match(H.hooks.connState().statusMsg, /older version/);

  // (b) wrong protocol version (back-off reset so the case stands alone).
  H.hooks.resetHandshakeThrottle();
  ({ c, got } = dialH());
  await until(() => c.open, 'open b');
  H.hooks.acceptInbound();
  c.send({ type: 'hello', v: 1, nonce: randomNonce() });
  await until(() => c.closed, 'closed b');
  assert.equal(got.length, 0, 'a v1 hello gets no answer');
  assert.match(H.hooks.connState().statusMsg, /incompatible sync version/);

  // (c) ciphertext before the handshake.
  H.hooks.resetHandshakeThrottle();
  ({ c, got } = dialH());
  await until(() => c.open, 'open c');
  H.hooks.acceptInbound();
  c.send({ type: 'enc', v: 2, iv: b64(new Uint8Array(12)), ct: b64(new Uint8Array(32)) });
  await until(() => c.closed, 'closed c');
  assert.equal(got.length, 0);

  // Failures back off inbound connections: the next one is closed on arrival
  // (no banner, no answer), so a guessing peer gets nothing to test against.
  ({ c, got } = dialH());
  await until(() => c.closed, 'closed while throttled');
  H.hooks.acceptInbound();
  assert.equal(H.hooks.connState().conn, null, 'nothing pending to accept while throttled');
  assert.equal(got.length, 0);
  assert.ok(!JSON.stringify(broker.wire).includes('host secret entry'), 'the host never sent its journal');
  assert.equal(pairingOf(H).peer, null, 'the host never adopted the raw peer');
});

test('a valid hello followed by a bad hello-ok proof is closed after the ack, never ready', async () => {
  const broker = makeBroker();
  const H = bootDevice(broker, { entries: [entry('h1', 'host secret entry', 100)] });
  await until(() => peerOf(H), 'H peer');
  const pairH = pairingOf(H);
  const keys = await H.hooks.deriveKeys(pairH.secret, pairH.room);
  const raw = new broker.FakePeer('rephrame-rawdial');
  await until(() => broker.peers.has('rephrame-rawdial'), 'raw registered');
  const got = [];
  const c = raw.connect(peerOf(H).id);
  c.on('data', (m) => got.push(m));
  await until(() => c.open, 'open');
  H.hooks.acceptInbound();
  const nonce = randomNonce();
  c.send({ type: 'hello', v: 2, nonce });
  await until(() => got.length === 1, 'hello-ack');
  assert.equal(got[0].type, 'hello-ack');
  assert.equal(got[0].v, 2);
  assert.equal(await H.hooks.verifyProof(keys.mac, 'ack', nonce, got[0].proof), true, 'the responder proves the secret first');
  assert.equal(H.hooks.connState().ready, false, 'not ready until the dialler proves it too');
  c.send({ type: 'hello-ok', v: 2, proof: b64(new Uint8Array(32)) });
  await until(() => c.closed, 'closed');
  assert.equal(got.length, 1, 'no enc message ever left the host');
  assert.equal(H.hooks.connState().ready, false);
  assert.match(H.hooks.connState().statusMsg, /codes do not match/);
  // …and with the right proof the same exchange completes and turns to ciphertext.
  H.hooks.resetHandshakeThrottle(); // past the back-off from the single failure
  const got2 = [];
  const c2 = raw.connect(peerOf(H).id);
  c2.on('data', (m) => got2.push(m));
  await until(() => c2.open, 'open 2');
  H.hooks.acceptInbound();
  const nonce2 = randomNonce();
  c2.send({ type: 'hello', v: 2, nonce: nonce2 });
  await until(() => got2.length === 1, 'hello-ack 2');
  c2.send({ type: 'hello-ok', v: 2, proof: await H.hooks.makeProof(keys.mac, 'ok', got2[0].nonce) });
  await until(() => H.hooks.connState().ready && got2.length >= 2, 'ready + state');
  assert.ok(got2.slice(1).every((m) => m.type === 'enc'));
  const inner = await H.hooks.decrypt(keys, H.hooks.aadFor(nonce2, got2[0].nonce, 'responder'), got2[1]);
  assert.equal(inner.type, 'state');
  assert.equal(inner.payload.entries[0].body, 'host secret entry', 'the journal only travels inside the ciphertext');
  assert.equal(pairingOf(H).peer, 'rephrame-rawdial', 'the host adopts the peer that proved the secret');
  assert.equal(pairingOf(H).verified, true);
});

test('a pre-v2 pairing (room without secret) is neither dialled nor accepted until a new code is generated', async () => {
  const broker = makeBroker();
  const L = bootDevice(broker, {
    storage: makeStorage({ rephrame_sync_enabled: '1', rephrame_sync_room: 'RFR-ZZZ-ZZZ', rephrame_peer_id_v1: 'rephrame-legacy' }),
  });
  await sleep(30);
  assert.equal(peerOf(L), null, 'no peer is registered for a legacy pairing');
  assert.equal(broker.peers.size, 0);
  assert.equal(L.hooks.connState().legacy, true);
  assert.equal(L.hooks.connState().status, 'unpaired');
  L.hooks.connect('RFR-ZZZ-ZZZ');
  assert.match(L.hooks.connState().statusMsg, /older version/);
  assert.equal(peerOf(L), null, 'an old-format code does not start anything');
  // Generating a new code mints a room + secret, retires the legacy record
  // and registers the new id.
  L.hooks.regenerateCode();
  await until(() => peerOf(L), 'peer after regenerate');
  const p = pairingOf(L);
  assert.equal(p.secret.length, 12);
  assert.equal(p.peer, null);
  assert.equal(peerOf(L).id, 'rephrame-' + p.room.toLowerCase());
  assert.equal(L.storage.getItem('rephrame_peer_id_v1'), peerOf(L).id, 'the old device id is replaced');
  assert.equal(L.storage.getItem('rephrame_sync_room'), null, 'the legacy room record is removed');
  assert.equal(L.hooks.connState().legacy, false);
});

test('generating a new pairing code rotates the room id and secret and forgets the old partner', async () => {
  const broker = makeBroker();
  const A = bootDevice(broker);
  await until(() => peerOf(A), 'A peer');
  const before = pairingOf(A);
  const oldPeer = peerOf(A);
  A.hooks.regenerateCode();
  await until(() => peerOf(A) && peerOf(A) !== oldPeer, 'new peer');
  const after = pairingOf(A);
  assert.notEqual(after.room, before.room);
  assert.notEqual(after.secret, before.secret);
  assert.equal(after.peer, null);
  assert.equal(after.verified, false);
  assert.equal(oldPeer.destroyed, true, 'the old id is released');
  assert.equal(peerOf(A).id, 'rephrame-' + after.room.toLowerCase());
});

test('with a PIN set and the journal locked, no peer is registered until unlock; locking takes it down again', async () => {
  const broker = makeBroker();
  new broker.FakePeer('rephrame-other1'); // the paired device, online but silent
  let unlocked = false;
  const P = bootDevice(broker, {
    storage: makeStorage({
      rephrame_sync_enabled: '1',
      rephrame_peer_id_v1: 'rephrame-ab3c9d',
      rephrame_sync_pair_v2: JSON.stringify({ room: 'AB3C9D', secret: '0123456789AB', peer: 'rephrame-other1', verified: true }),
    }),
    globals: { hasPin: () => true, isUnlocked: () => unlocked },
  });
  await sleep(30);
  assert.equal(peerOf(P), null, 'locked: no peer, no dial');
  assert.equal(broker.peers.has('rephrame-ab3c9d'), false);
  assert.equal(broker.wire.length, 0);
  unlocked = true;
  P.dispatch('rephrame:unlocked');
  await until(() => peerOf(P), 'peer after unlock');
  await until(() => P.hooks.connState().conn !== null, 'auto-dial after unlock');
  assert.equal(P.hooks.connState().conn.peer, 'rephrame-other1');
  unlocked = false;
  P.dispatch('rephrame:locked');
  assert.equal(peerOf(P), null, 'locked again: peer destroyed');
  assert.equal(P.hooks.connState().conn, null);
  assert.equal(broker.peers.has('rephrame-ab3c9d'), false);
});
