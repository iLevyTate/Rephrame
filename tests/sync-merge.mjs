// Unit harness for the P2P merge core in js/sync.js — no browser, no WebRTC.
// The transport (PeerJS/RTCDataChannel) is untestable here, but the part that
// actually decides whether your entries survive a sync — _mergeState, the
// last-write-wins comparison, and the deletion-tombstone bookkeeping — is pure
// logic over `state.entries` + localStorage. We load the REAL sync.js into a
// Node vm context with stubbed globals and exercise that logic directly, so a
// regression in merge/LWW/tombstone behavior fails CI without two devices.
//
// Runs in CI (.github/workflows/smoke.yml) and locally via `npm run sync`.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'sync.js'), 'utf8');
// Re-export the script-scoped (const/let + function) names we need to drive,
// so the harness can reach them regardless of vm hoisting rules.
const EXPORT_SHIM = `;Object.assign(globalThis, {
  _mergeState, _packState, _loadEntryDels, _saveEntryDels, _mergeDelMaps,
  _entryTs, _clampSyncTs, _payloadInvalid, _wireConn,
  syncRecordEntryDeletion, syncClearEntryDeletion, SYNC_VERSION,
});`;

// A fresh, isolated "device": its own localStorage + in-memory entries.
function makeDevice(initialEntries = []) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const state = { entries: initialEntries.map((e) => ({ ...e })) };
  const sandbox = {
    localStorage, state, console: { warn() {}, log() {}, error() {} },
    Date, JSON, Math, setTimeout, clearTimeout,
    // app.js globals sync.js references; _mergeState calls these guarded.
    persist() { /* in the app this re-saves state.entries; here it's a no-op */ },
    render() {},
    normalizeEntry: (e) => ({ ...e }),
    window: { addEventListener() {} },
    // DOM stub: _setSyncStatus / _renderSyncActionRow bail when these return null.
    document: { getElementById: () => null },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC + EXPORT_SHIM, sandbox, { filename: 'sync.js' });
  return {
    sandbox, state,
    setDels(map) { store.set('rephrame_entry_dels', JSON.stringify(map)); },
    getDels() { return JSON.parse(store.get('rephrame_entry_dels') || '{}'); },
    merge(remote) { sandbox._mergeState(remote); },
    wire(conn) { sandbox._wireConn(conn); },
    byId(id) { return state.entries.find((e) => e.id === id); },
  };
}

// A minimal stand-in for a PeerJS DataConnection: records sent messages and
// lets a test fire the handlers sync.js registers via conn.on(...).
function fakeConn(peer = 'rephrame-zzzzzz') {
  const handlers = {};
  return {
    peer, open: true, sent: [],
    on(ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); },
    emit(ev, arg) { (handlers[ev] || []).forEach((cb) => cb(arg)); },
    send(m) { this.sent.push(m); },
    close() { this.open = false; },
  };
}

// Build a remote packet the way _packState would, but with explicit fields so
// tests control timestamps precisely.
const packet = (entries, entryDels = {}) => ({
  syncV: 1, sentAt: Date.now(), entries, entryDels,
});

const NOW = Date.now();
const T0 = NOW - 500000;  // created
const T1 = NOW - 400000;  // first edit
const T2 = NOW - 300000;  // delete
const T3 = NOW - 200000;  // restore / later edit

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { failures++; console.log(' FAIL ' + name + '\n        ' + (e.message || e)); }
};

// ── Last-write-wins ──────────────────────────────────────────────────────────
test('newer updatedAt from a peer overwrites the local copy', () => {
  const d = makeDevice([{ id: 'x', createdAt: T0, updatedAt: T1, trigger: 'local-old' }]);
  d.merge(packet([{ id: 'x', createdAt: T0, updatedAt: T3, trigger: 'peer-new' }]));
  assert.equal(d.byId('x').trigger, 'peer-new', 'peer edit (T3) should win over local (T1)');
});

test('older updatedAt from a peer does NOT overwrite a newer local copy', () => {
  const d = makeDevice([{ id: 'x', createdAt: T0, updatedAt: T3, trigger: 'local-new' }]);
  d.merge(packet([{ id: 'x', createdAt: T0, updatedAt: T1, trigger: 'peer-old' }]));
  assert.equal(d.byId('x').trigger, 'local-new', 'stale peer edit must not clobber a newer local edit');
});

test('a tie (equal timestamps) keeps the local copy — no needless churn', () => {
  const d = makeDevice([{ id: 'x', createdAt: T0, updatedAt: T1, trigger: 'local' }]);
  d.merge(packet([{ id: 'x', createdAt: T0, updatedAt: T1, trigger: 'peer' }]));
  assert.equal(d.byId('x').trigger, 'local', 'equal timestamps should not overwrite');
});

test('never-edited entries fall back to createdAt for LWW', () => {
  // Local has no updatedAt; peer copy created later (and also no updatedAt).
  const d = makeDevice([{ id: 'x', createdAt: T0, trigger: 'local' }]);
  d.merge(packet([{ id: 'x', createdAt: T2, trigger: 'peer-newer-create' }]));
  assert.equal(d.byId('x').trigger, 'peer-newer-create', 'later createdAt should win when neither side was edited');
});

test('an entry only the peer has is added locally', () => {
  const d = makeDevice([{ id: 'a', createdAt: T0, updatedAt: T1 }]);
  d.merge(packet([{ id: 'b', createdAt: T2, updatedAt: T2, trigger: 'from-peer' }]));
  assert.ok(d.byId('b'), 'peer-only entry should appear locally');
  assert.equal(d.state.entries.length, 2);
});

// ── Tombstones / deletion ────────────────────────────────────────────────────
test("a peer's deletion tombstone removes the matching local entry", () => {
  const d = makeDevice([{ id: 'x', createdAt: T0, updatedAt: T1, trigger: 'keep-me?' }]);
  d.merge(packet([], { x: T2 }));  // peer deleted x at T2 (> local T1)
  assert.equal(d.byId('x'), undefined, 'entry deleted on the peer should be removed locally');
  assert.equal(d.getDels().x, T2, 'tombstone is retained after applying');
});

test('a stale peer copy cannot resurrect an entry we already deleted', () => {
  const d = makeDevice([]);                 // we already dropped x locally
  d.setDels({ x: T2 });                      // and hold a tombstone at T2
  d.merge(packet([{ id: 'x', createdAt: T0, updatedAt: T1, trigger: 'zombie' }]));
  assert.equal(d.byId('x'), undefined, 'an older peer copy (T1) must not undo a newer deletion (T2)');
});

test('undo-delete propagates: a restore newer than the tombstone resurrects + clears it', () => {
  // This is the cross-device undo path. The app stamps updatedAt at restore
  // time (touchEntry), so the restored entry is newer than its own tombstone.
  const d = makeDevice([]);                 // peer-side: x currently deleted
  d.setDels({ x: T2 });
  // Restoring device sends x with a restore-time updatedAt (T3 > T2) and a
  // cleared tombstone map.
  d.merge(packet([{ id: 'x', createdAt: T0, updatedAt: T3, trigger: 'restored' }], {}));
  assert.ok(d.byId('x'), 'a restore newer than the tombstone should resurrect the entry');
  assert.equal(d.byId('x').trigger, 'restored');
  assert.equal(d.getDels().x, undefined, 'the stale tombstone is dropped once the restore wins');
});

test('syncRecordEntryDeletion writes a tombstone the next merge honors', () => {
  const d = makeDevice([{ id: 'x', createdAt: T0, updatedAt: T1 }]);
  d.sandbox.syncRecordEntryDeletion('x');
  assert.ok(d.getDels().x, 'deletion records a tombstone');
  // A peer that still has x but older than the tombstone must not bring it back.
  d.merge(packet([{ id: 'x', createdAt: T0, updatedAt: T1 }]));
  assert.equal(d.byId('x'), undefined);
});

// ── Robustness ───────────────────────────────────────────────────────────────
test('a payload with the wrong protocol version is rejected wholesale', () => {
  const d = makeDevice([{ id: 'x', createdAt: T0, updatedAt: T1, trigger: 'intact' }]);
  d.merge({ syncV: 999, entries: [{ id: 'x', updatedAt: T3, trigger: 'hijack' }] });
  assert.equal(d.byId('x').trigger, 'intact', 'mismatched syncV must not mutate local state');
});

test('a non-object / array payload is rejected without throwing', () => {
  const d = makeDevice([{ id: 'x', createdAt: T0, updatedAt: T1 }]);
  d.merge(null);
  d.merge([1, 2, 3]);
  d.merge(undefined);
  assert.equal(d.state.entries.length, 1, 'garbage payloads are no-ops');
});

test('entries with no id are skipped, valid ones in the same batch still merge', () => {
  const d = makeDevice([]);
  d.merge(packet([{ updatedAt: T2 }, { id: 'ok', createdAt: T2, updatedAt: T2, trigger: 'good' }]));
  assert.equal(d.state.entries.length, 1);
  assert.equal(d.byId('ok').trigger, 'good');
});

test('merging the same packet twice is idempotent', () => {
  const d = makeDevice([{ id: 'x', createdAt: T0, updatedAt: T1, trigger: 'local' }]);
  const p = packet([{ id: 'x', createdAt: T0, updatedAt: T3, trigger: 'peer' }, { id: 'y', createdAt: T2, updatedAt: T2 }]);
  d.merge(p);
  const after1 = JSON.stringify(d.state.entries);
  d.merge(p);
  assert.equal(JSON.stringify(d.state.entries), after1, 'a second identical merge changes nothing');
});

test('entries stay sorted newest-first by createdAt after a merge', () => {
  const d = makeDevice([{ id: 'old', createdAt: T0, updatedAt: T0 }]);
  d.merge(packet([{ id: 'new', createdAt: T3, updatedAt: T3 }, { id: 'mid', createdAt: T1, updatedAt: T1 }]));
  // Join to a string before comparing: state.entries is an Array created
  // inside the vm realm, so its prototype differs from a main-realm array
  // literal and deepStrictEqual would reject an otherwise-identical list.
  const order = d.state.entries.map((e) => e.id).join(',');
  assert.equal(order, 'new,mid,old', 'merged list is ordered newest createdAt first');
});

// ── Connection lifecycle guards (stale-connection hygiene) ───────────────────
test('data from a replaced/stale connection is ignored; the live one still merges', () => {
  const d = makeDevice([]);
  const a = fakeConn('rephrame-aaaaaa');
  const b = fakeConn('rephrame-bbbbbb');
  d.wire(a);            // a becomes the live connection
  d.wire(b);            // b replaces a; a is now stale
  // A late 'data' from the stale connection must NOT be merged.
  a.emit('data', { type: 'state', payload: packet([{ id: 'stale', createdAt: T2, updatedAt: T2 }]) });
  assert.equal(d.byId('stale'), undefined, 'stale connection data must be dropped');
  // The live connection still merges normally.
  b.emit('data', { type: 'state', payload: packet([{ id: 'live', createdAt: T2, updatedAt: T2 }]) });
  assert.ok(d.byId('live'), 'live connection data should merge');
});

test('a stale connection closing does not tear down the live connection', () => {
  const d = makeDevice([]);
  const a = fakeConn('rephrame-aaaaaa');
  const b = fakeConn('rephrame-bbbbbb');
  d.wire(a);
  d.wire(b);            // b is live, a is stale
  a.emit('close');      // stale close — must not null out the live _conn
  // If the live connection were torn down, its data would be ignored.
  b.emit('data', { type: 'state', payload: packet([{ id: 'after', createdAt: T2, updatedAt: T2 }]) });
  assert.ok(d.byId('after'), 'live connection must survive a stale connection close');
});

if (failures) {
  console.error(`\nsync-merge: ${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\nsync-merge: all merge/LWW/tombstone tests passed.');
