// P2P sync logic walk. The merge / payload-validation / timestamp-clamp paths
// in js/sync.js are the highest-risk part of device sync — a bug there can
// silently drop or resurrect entries — but they're normally only reachable
// through a live two-peer WebRTC session, which can't run in CI. js/sync.js
// exposes those pure functions as window.__syncTestHooks, so this walk drives
// them directly: last-write-wins, deletion-tombstone precedence, future-date
// clamping, and oversized/invalid payload rejection.
//
// Runs in CI (.github/workflows/smoke.yml) and locally via `npm run sync`
// after `npm run serve` in another shell.
//
// Env:
//   SMOKE_URL  default http://localhost:8765/index.html
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const URL = process.env.SMOKE_URL ?? 'http://localhost:8765/index.html';
const log = (m) => console.log('[sync] ' + m);

const browser = await chromium.launch();
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  // Skip onboarding so the app boots straight to a usable state.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('reframe-onboarded-v1', '1'); } catch (_) {}
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app', { timeout: 10000 });

  const hooksReady = await page.evaluate(() => !!(window.__syncTestHooks
    && typeof window.__syncTestHooks.mergeState === 'function'));
  assert.ok(hooksReady, 'window.__syncTestHooks is exposed by js/sync.js');

  // ── Timestamp clamp ──────────────────────────────────────────────────────
  const clamp = await page.evaluate(() => {
    const h = window.__syncTestHooks;
    const now = Date.now();
    return {
      future: h.clampTs(now + 10 * 60 * 1000) <= now + 1000, // far-future pulled back to ~now
      invalid: h.clampTs('not-a-date'),                        // unparseable → 0
      valid: h.clampTs(1000),                                  // a real past ms passes through
    };
  });
  assert.ok(clamp.future, 'A far-future timestamp is clamped back to ~now');
  assert.equal(clamp.invalid, 0, 'An unparseable timestamp clamps to 0');
  assert.equal(clamp.valid, 1000, 'A valid past timestamp passes through unchanged');
  log('PASS — timestamp clamping (future / invalid / valid).');

  // ── Payload validation ───────────────────────────────────────────────────
  const valid = await page.evaluate(() => {
    const h = window.__syncTestHooks;
    return {
      nullPayload: h.payloadInvalid(null),
      arrayPayload: h.payloadInvalid([]),
      wrongVersion: h.payloadInvalid({ syncV: h.SYNC_VERSION + 999, entries: [] }),
      oversize: h.payloadInvalid({ syncV: h.SYNC_VERSION, entries: [], big: 'x'.repeat(5_000_001) }),
      tooManyEntries: h.payloadInvalid({
        syncV: h.SYNC_VERSION,
        entries: Array.from({ length: h.MAX_ENTRIES + 1 }, () => ({})),
      }),
      good: h.payloadInvalid({ syncV: h.SYNC_VERSION, entries: [] }),
    };
  });
  assert.equal(valid.nullPayload, true, 'null payload rejected');
  assert.equal(valid.arrayPayload, true, 'array payload rejected (must be an object)');
  assert.equal(valid.wrongVersion, true, 'mismatched syncV rejected');
  assert.equal(valid.oversize, true, 'payload over the byte cap rejected');
  assert.equal(valid.tooManyEntries, true, 'payload over the entry-count cap rejected');
  assert.equal(valid.good, false, 'a well-formed payload is accepted');
  log('PASS — payload validation (null / array / version / size / count / good).');

  // ── Merge: last-write-wins ────────────────────────────────────────────────
  const lww = await page.evaluate(() => {
    const h = window.__syncTestHooks;
    const base = (updatedAt, body) => ({
      id: 'A', kind: 'freeform', createdAt: '2024-01-01T00:00:00.000Z', updatedAt, body,
    });
    // Remote newer than local → remote wins.
    localStorage.removeItem('rephrame_entry_dels');
    state.entries = [base(100, 'old')];
    h.mergeState({ syncV: h.SYNC_VERSION, entries: [base(200, 'new')], entryDels: {} });
    const newerWins = (state.entries.find(e => e.id === 'A') || {}).body;

    // Remote older than local → local wins.
    localStorage.removeItem('rephrame_entry_dels');
    state.entries = [base(100, 'local')];
    h.mergeState({ syncV: h.SYNC_VERSION, entries: [base(50, 'stale-remote')], entryDels: {} });
    const olderLoses = (state.entries.find(e => e.id === 'A') || {}).body;

    return { newerWins, olderLoses };
  });
  assert.equal(lww.newerWins, 'new', 'A newer remote edit overwrites the local copy (LWW)');
  assert.equal(lww.olderLoses, 'local', 'An older remote edit does NOT clobber a newer local copy');
  log('PASS — last-write-wins in both directions.');

  // ── Merge: deletion tombstone ─────────────────────────────────────────────
  const tomb = await page.evaluate(() => {
    const h = window.__syncTestHooks;
    // Local holds B; remote carries a tombstone newer than B → B is removed.
    localStorage.removeItem('rephrame_entry_dels');
    state.entries = [{ id: 'B', kind: 'freeform', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: 100, body: 'doomed' }];
    h.mergeState({ syncV: h.SYNC_VERSION, entries: [], entryDels: { B: 100000 } });
    const removedByTombstone = !state.entries.some(e => e.id === 'B');

    // A local copy NEWER than the tombstone survives (resurrection wins).
    localStorage.removeItem('rephrame_entry_dels');
    const fresh = Date.now();
    state.entries = [{ id: 'C', kind: 'freeform', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: fresh, body: 'kept' }];
    h.mergeState({ syncV: h.SYNC_VERSION, entries: [], entryDels: { C: fresh - 10000 } });
    const survivesStaleTombstone = state.entries.some(e => e.id === 'C');

    localStorage.removeItem('rephrame_entry_dels');
    return { removedByTombstone, survivesStaleTombstone };
  });
  assert.equal(tomb.removedByTombstone, true, 'A tombstone newer than the entry removes it on merge');
  assert.equal(tomb.survivesStaleTombstone, true, 'An entry edited after its tombstone is NOT re-deleted');
  log('PASS — deletion tombstone precedence (delete wins / resurrection wins).');

  assert.equal(pageErrors.length, 0, 'No uncaught page errors during the sync walk: ' + JSON.stringify(pageErrors));
  await ctx.close();
  log('PASS — all sync-logic assertions held.');
} catch (err) {
  failed = true;
  console.error('[sync] FAIL — ' + (err && err.message ? err.message : err));
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
