// Regression walk for bugs fixed after the initial audit rounds. Each block
// is a self-contained browser context that reproduces the original failure
// mode and asserts the fixed behavior, so a re-introduction fails CI loudly:
//
//   1. Worry `resolution` is whitelisted (no markup injection through the
//      card's class attribute) and the resolved-status pill gets a class that
//      styles.css actually defines.
//   2. The Patterns sparkline ignores the unnamed placeholder mood every
//      thought record carries (it used to draw a flat line at 40).
//   3. A worry escalation only resolves the worry when the escalated draft is
//      the entry being saved — editing an unrelated entry in between must not
//      link the worry to it.
//   4. Print / Save-as-PDF prints the journal from any view and restores the
//      previous view afterwards.
//   5. Closing a modal returns focus to an opener that lives inside #view.
//   6. Changing the worry-window time keeps the time input focused.
//   7. An inline pivot reflection still records the outcome on blur after a
//      background re-render happened mid-typing.
//   8. Starting a fresh capture while an edit is in progress asks before
//      wiping the stashed new-entry draft.
//   9. Another tab clearing its draft doesn't flip this tab's blank worry
//      capture form into a thought record.
//  10. An unreadable journal blob is stashed under a side key, not lost.
//  11. A P2P merge that arrives mid-typing doesn't yank focus.
//  12. Coping-card / cross-link taps clear a search that would hide the target.
//  13. Sync connection lifecycle: a dead dial is dropped on peer-unavailable so
//      the paired device's later inbound dial is accepted; replacing an open
//      connection doesn't trigger its own auto-reconnect.
//
// Runs in CI (.github/workflows/smoke.yml) and locally via `npm run regressions`
// after `npm run serve` in another shell.
//
// Env:
//   SMOKE_URL  default http://localhost:8765/index.html
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const URL = process.env.SMOKE_URL ?? 'http://localhost:8765/index.html';
const log = (m) => console.log('[regressions] ' + m);

const ONBOARDED = () => { try { localStorage.setItem('reframe-onboarded-v1', '1'); } catch (_) {} };

const browser = await chromium.launch();
let failed = false;

// Open a page on a fresh context, pre-seeded with `seed` (run as an init
// script, receives `arg`). Returns { ctx, page, errors }.
async function openApp(seed, arg) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addInitScript(ONBOARDED);
  if (seed) await ctx.addInitScript(seed, arg);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app', { timeout: 10000 });
  return { ctx, page, errors };
}
const noErrors = (errors, label) =>
  assert.equal(errors.length, 0, 'No uncaught page errors (' + label + '): ' + JSON.stringify(errors));

try {
  // ── 1. Worry resolution whitelist + pill class ─────────────────────────
  {
    const PAYLOAD = '"><img src=x onerror="window.__xssFired=true">';
    const { ctx, page, errors } = await openApp((payload) => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'w-hostile', kind: 'worry', createdAt: '2024-05-01T10:00:00.000Z', worryText: 'hostile', resolution: payload },
        { id: 'w-done', kind: 'worry', createdAt: '2024-05-02T10:00:00.000Z', worryText: 'done', resolution: 'dissolved', resolvedAt: '2024-05-03T10:00:00.000Z' },
      ]));
    }, PAYLOAD);
    await page.locator('[data-nav="journal"]').click();
    await page.waitForSelector('.entry-card--worry', { timeout: 5000 });
    assert.equal(await page.locator('.entry-card--worry img').count(), 0, 'Hostile resolution injects no element');
    assert.equal(await page.evaluate(() => window.__xssFired === true), false, 'Hostile resolution never executes');
    const hostileRes = await page.evaluate(() => state.entries.find(e => e.id === 'w-hostile').resolution);
    assert.equal(hostileRes, null, 'Unknown resolution normalizes to null (still parked)');
    assert.equal(await page.locator('#entry-w-hostile .flag-worry--parked').count(), 1, 'Unknown resolution renders as Parked');
    assert.equal(await page.locator('#entry-w-done .flag-worry--resolved--dissolved').count(), 1,
      'Resolved pill carries the class styles.css defines (flag-worry--resolved--dissolved)');
    noErrors(errors, 'worry resolution');
    log('PASS — worry resolution is whitelisted and the resolved pill class matches the stylesheet.');
    await ctx.close();
  }

  // ── 2. Sparkline skips the unnamed placeholder mood ────────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      const rec = (id, moods) => ({
        id, kind: 'thought-record', createdAt: new Date(Date.now() - Number(id.slice(-1)) * 3600e3).toISOString(),
        trigger: 'x', thoughts: [{ id: id + 't', text: 'thought', isHot: true }], moods,
      });
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        rec('r1', [{ id: 'm1', family: '', variant: '', intensity: 40 }]),
        rec('r2', [{ id: 'm2', family: '', variant: '', intensity: 40 }]),
        rec('r3', [{ id: 'm3', family: '', variant: '', intensity: 40 }]),
      ]));
    });
    await page.locator('[data-nav="patterns"]').click();
    await page.waitForSelector('.patterns-grid', { timeout: 5000 });
    assert.equal(await page.locator('.spark-wrap').count(), 0, 'No intensity sparkline when no entry has a named mood');
    await page.evaluate(() => {
      state.entries[0].moods[0].family = 'Anxiety';
      state.entries[1].moods[0].family = 'Shame';
      render();
    });
    assert.equal(await page.locator('.spark-wrap').count(), 1, 'Sparkline appears once ≥2 entries carry a named mood');
    const points = await page.locator('.spark-wrap circle').count();
    assert.equal(points, 2, 'Only the named-mood entries are plotted (placeholder-only entry excluded)');
    noErrors(errors, 'sparkline');
    log('PASS — sparkline plots named moods only.');
    await ctx.close();
  }

  // ── 3. Worry escalation links only the escalated draft ─────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'ff1', kind: 'freeform', createdAt: '2024-06-01T10:00:00.000Z', body: 'unrelated free write' },
        { id: 'wo1', kind: 'worry', createdAt: '2024-06-02T10:00:00.000Z', worryText: 'What if the talk goes badly?', parkedAt: '2024-06-02T10:00:00.000Z' },
      ]));
    });
    await page.locator('[data-nav="journal"]').click();
    await page.locator('#entry-wo1 .entry-card-head').click();
    await page.locator('[data-action="worry-escalate"][data-id="wo1"]').click();
    await page.waitForSelector('textarea[data-field="trigger"]', { timeout: 5000 });
    // Walk away mid-escalation and edit an unrelated entry.
    await page.locator('[data-nav="journal"]').click();
    await page.locator('#entry-ff1 .entry-card-head').click();
    await page.locator('[data-action="edit"][data-id="ff1"]').click();
    await page.waitForSelector('textarea[data-field="body"]', { timeout: 5000 });
    await page.locator('[data-action="save-entry"]').click();
    await page.waitForTimeout(200);
    const afterEdit = await page.evaluate(() => {
      const w = state.entries.find(e => e.id === 'wo1');
      return { resolution: w.resolution, linked: w.linkedEntryId || '' };
    });
    assert.equal(afterEdit.resolution, null, 'Saving an unrelated edit leaves the worry parked');
    assert.equal(afterEdit.linked, '', 'Saving an unrelated edit does not link the worry to it');
    // Resume the stashed escalation draft and save it; now the worry resolves.
    await page.locator('[data-action="resume-draft"]').click();
    await page.waitForSelector('[data-action="next-step"]', { timeout: 5000 });
    for (let i = 0; i < 6; i++) {
      await page.locator('[data-action="next-step"]').click();
      await page.waitForTimeout(80);
    }
    await page.locator('[data-action="save-entry"]').click();
    await page.waitForTimeout(200);
    const afterSave = await page.evaluate(() => {
      const w = state.entries.find(e => e.id === 'wo1');
      const rec = state.entries.find(e => e.kind === 'thought-record' && e.linkedEntryId === 'wo1');
      return { resolution: w.resolution, linked: w.linkedEntryId, recId: rec ? rec.id : null };
    });
    assert.equal(afterSave.resolution, 'escalated', 'Saving the escalated draft resolves the worry');
    assert.ok(afterSave.recId && afterSave.linked === afterSave.recId, 'Worry links to the new thought record, and vice versa');
    noErrors(errors, 'escalation');
    log('PASS — worry escalation resolves only against the escalated draft.');
    await ctx.close();
  }

  // ── 4. Print always prints the journal, then restores the view ─────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'p1', kind: 'freeform', createdAt: '2024-06-01T10:00:00.000Z', body: 'print me' },
      ]));
    });
    await page.locator('[data-nav="patterns"]').click();
    await page.waitForSelector('.patterns-grid', { timeout: 5000 });
    await page.evaluate(() => {
      window.print = () => {
        window.__printedView = state.view;
        window.__printedCards = document.querySelectorAll('.entry-card.expanded').length;
        setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0);
      };
    });
    await page.locator('[data-action="open-settings"]').first().click();
    await page.locator('[data-action="open-export"]').first().click();
    await page.locator('[data-action="export-print"]').click();
    await page.waitForFunction(() => window.__printedView !== undefined, null, { timeout: 5000 });
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => ({ printed: window.__printedView, cards: window.__printedCards, now: state.view, printMode: state.printMode }));
    assert.equal(r.printed, 'journal', 'Print renders the journal even when opened from Patterns');
    assert.equal(r.cards, 1, 'Every entry is expanded for print');
    assert.equal(r.now, 'patterns', 'Previous view is restored after printing');
    assert.equal(r.printMode, false, 'printMode cleared after printing');
    noErrors(errors, 'print');
    log('PASS — print switches to the journal and restores the prior view.');
    await ctx.close();
  }

  // ── 5. Modal focus returns to an in-view opener ────────────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'f1', kind: 'freeform', createdAt: '2024-06-01T10:00:00.000Z', body: 'focus me' },
      ]));
    });
    await page.locator('[data-nav="journal"]').click();
    await page.locator('#entry-f1 .entry-card-head').click();
    const del = page.locator('[data-action="delete"][data-id="f1"]');
    await del.focus();
    await del.press('Enter');
    await page.waitForSelector('[data-action="confirm-delete"]', { timeout: 5000 });
    await page.locator('.modal [data-action="close-modal"]').click();
    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), null, { timeout: 5000 });
    await page.waitForTimeout(50);
    const focused = await page.evaluate(() => {
      const a = document.activeElement;
      return a ? (a.dataset.action || '') + ':' + (a.dataset.id || '') : 'none';
    });
    assert.equal(focused, 'delete:f1', 'Focus returns to the (re-rendered) Delete button that opened the modal');
    noErrors(errors, 'modal focus');
    log('PASS — modal close returns focus to an opener inside #view.');
    await ctx.close();
  }

  // ── 6. Worry-window time input keeps focus on change ───────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'w1', kind: 'worry', createdAt: '2024-06-02T10:00:00.000Z', worryText: 'parked', parkedAt: '2024-06-02T10:00:00.000Z', scheduledFor: '2024-06-02T18:00:00.000Z' },
      ]));
    });
    await page.locator('[data-action="open-settings"]').first().click();
    const time = page.locator('[data-action="set-worry-window-time"]');
    await time.fill('07:15');
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => ({
      focusedIsTime: document.activeElement && document.activeElement.dataset.action === 'set-worry-window-time',
      setting: state.settings.worryWindowTime,
      rescheduled: /T07:15|07:15/.test(new Date(state.entries[0].scheduledFor).toLocaleTimeString('en-GB')) ||
        new Date(state.entries[0].scheduledFor).getHours() === 7,
    }));
    assert.equal(r.setting, '07:15', 'Worry window setting saved');
    assert.equal(r.rescheduled, true, 'Parked worry rescheduled onto the new window');
    assert.equal(r.focusedIsTime, true, 'Time input is still focused after the change (modal not rebuilt)');
    noErrors(errors, 'worry window time');
    log('PASS — worry-window time change keeps the input focused.');
    await ctx.close();
  }

  // ── 7. Reflection commit survives a mid-typing re-render ───────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([{
        id: 'tr1', kind: 'thought-record', createdAt: '2024-06-01T10:00:00.000Z', trigger: 'x',
        thoughts: [{ id: 't', text: 'thought', isHot: true }], moods: [],
        pivot: 'do the thing', pivotDone: true, pivotDoneAt: '2024-06-01T12:00:00.000Z',
      }]));
    });
    await page.locator('[data-nav="journal"]').click();
    await page.locator('#entry-tr1 .entry-card-head').click();
    const ta = page.locator('[data-action="edit-reflection"][data-id="tr1"]');
    await ta.click();
    await ta.pressSequentially('It went fine');
    // A background render (cross-tab write, peer patch) rebuilds #view.
    await page.evaluate(() => render());
    const ta2 = page.locator('[data-action="edit-reflection"][data-id="tr1"]');
    assert.equal(await ta2.inputValue(), 'It went fine', 'Typed text survives the re-render');
    await ta2.focus();
    await ta2.blur();
    await page.waitForTimeout(100);
    const recorded = await page.evaluate(() => state.entries[0].outcomeRecorded);
    assert.equal(recorded, true, 'Blur after a mid-typing re-render still records the outcome');
    noErrors(errors, 'reflection');
    log('PASS — inline reflection commit survives a background re-render.');
    await ctx.close();
  }

  // ── 8. Fresh capture while editing asks before wiping the stash ────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'e1', kind: 'freeform', createdAt: '2024-06-01T10:00:00.000Z', body: 'existing' },
      ]));
      localStorage.setItem('reframe-journal-draft-v1', JSON.stringify({
        kind: 'thought-record', trigger: 'half-written draft', thoughts: [{ id: 'd1', text: '', isHot: true }], moods: [],
      }));
    });
    await page.locator('[data-nav="journal"]').click();
    await page.locator('#entry-e1 .entry-card-head').click();
    await page.locator('[data-action="edit"][data-id="e1"]').click();
    await page.waitForSelector('textarea[data-field="body"]', { timeout: 5000 });
    await page.locator('[data-nav="journal"]').click();
    // A kind-filtered empty state exposes a "start-kind" fresh-capture button.
    await page.evaluate(() => { state.viewFilter = 'worries'; render(); });
    await page.locator('[data-action="start-kind"]').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-action="confirm-new-draft"]').count(), 1,
      'Starting a fresh capture mid-edit asks before discarding the stashed draft');
    const stash = await page.evaluate(() => localStorage.getItem('reframe-journal-draft-v1'));
    assert.ok(stash && stash.includes('half-written draft'), 'Stashed draft is intact while the prompt is open');
    await page.locator('[data-action="cancel-new-draft"]').click();
    noErrors(errors, 'stash guard');
    log('PASS — stashed draft is protected when a fresh capture starts mid-edit.');
    await ctx.close();
  }

  // ── 9. Cross-tab draft clear under a blank worry form ──────────────────
  {
    const { ctx, page, errors } = await openApp();
    await page.locator('[data-nav="capture"]').click();
    await page.locator('[data-action="set-capture-mode"][data-kind="worry"]').click();
    await page.waitForSelector('textarea[data-field="worryText"]', { timeout: 5000 });
    await page.evaluate(() => {
      localStorage.removeItem('reframe-journal-draft-v1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'reframe-journal-draft-v1' }));
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => state.draft.kind), 'worry', 'Blank worry form keeps its kind after another tab clears its draft');
    assert.equal(await page.locator('textarea[data-field="worryText"]').count(), 1, 'Worry form still on screen');
    noErrors(errors, 'cross-tab draft');
    log('PASS — cross-tab draft clear leaves a blank capture form alone.');
    await ctx.close();
  }

  // ── 10. Unreadable journal blob is stashed, not lost ───────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', '{"not": "an array"');
    });
    const r = await page.evaluate(() => ({
      stash: localStorage.getItem('reframe-journal-v1-unreadable'),
      toast: !!document.querySelector('.toast--error'),
      entries: state.entries.length,
    }));
    assert.equal(r.stash, '{"not": "an array"', 'Raw unreadable blob copied to the side key');
    assert.equal(r.toast, true, 'A persistent error toast tells the user');
    assert.equal(r.entries, 0, 'App still boots with an empty journal');
    noErrors(errors, 'corrupt journal');
    log('PASS — unreadable journal blob is preserved under a side key.');
    await ctx.close();
  }

  // ── 11. P2P merge mid-typing doesn't steal focus ───────────────────────
  {
    const { ctx, page, errors } = await openApp();
    await page.locator('[data-nav="capture"]').click();
    const trig = page.locator('textarea[data-field="trigger"]');
    await trig.click();
    await trig.pressSequentially('typing here');
    await page.evaluate(() => {
      window.__syncTestHooks.mergeState({
        syncV: window.__syncTestHooks.SYNC_VERSION, entryDels: {},
        entries: [{ id: 'remote-1', kind: 'freeform', createdAt: '2024-06-01T10:00:00.000Z', updatedAt: 1000, body: 'from peer' }],
      });
    });
    const r = await page.evaluate(() => ({
      merged: state.entries.some(e => e.id === 'remote-1'),
      stillFocused: document.activeElement && document.activeElement.dataset.field === 'trigger',
      value: document.activeElement ? document.activeElement.value : '',
    }));
    assert.equal(r.merged, true, 'Peer entry merged into state');
    assert.equal(r.stillFocused, true, 'Focus stays in the field being typed into');
    assert.equal(r.value, 'typing here', 'Typed text intact');
    noErrors(errors, 'merge focus');
    log('PASS — a peer merge mid-typing leaves focus alone.');
    await ctx.close();
  }

  // ── 12. Coping card tap clears a search hiding its entry ───────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([{
        id: 'fav1', kind: 'thought-record', createdAt: '2024-06-01T10:00:00.000Z', trigger: 'pinned one',
        thoughts: [{ id: 't', text: 'thought', isHot: true }], moods: [], newThought: 'a reframe', isFavorite: true,
      }, {
        id: 'other', kind: 'freeform', createdAt: '2024-06-02T10:00:00.000Z', body: 'needle',
      }]));
    });
    await page.locator('[data-nav="journal"]').click();
    await page.evaluate(() => { state.search = 'needle'; render(); });
    assert.equal(await page.locator('#entry-fav1').count(), 0, 'Search hides the pinned entry');
    await page.locator('.coping-card[data-id="fav1"]').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#entry-fav1.expanded').count(), 1, 'Tapping the coping card reveals and expands its entry');
    noErrors(errors, 'coping visibility');
    log('PASS — coping-card tap clears a hiding search.');
    await ctx.close();
  }

  // ── 13. Sync connection lifecycle (fake PeerJS) ────────────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('rephrame_sync_enabled', '1');
      window.__fakePeers = [];
      window.__mkConn = (peer, open) => ({
        peer, open, closed: false, sent: [], _h: {},
        on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; },
        emit(ev, ...a) { (this._h[ev] || []).forEach(fn => fn(...a)); },
        send(m) { this.sent.push(m); },
        // Mirrors PeerJS: close() only emits "close" if the channel had opened.
        close() { this.closed = true; if (this.open) { this.open = false; this.emit('close'); } },
      });
      window.Peer = class {
        constructor(id) { this.id = id; this.destroyed = false; this._h = {}; window.__fakePeers.push(this); }
        on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
        emit(ev, ...a) { (this._h[ev] || []).forEach(fn => fn(...a)); }
        connect(peerId) { const c = window.__mkConn(peerId, false); window.__lastDial = c; return c; }
        destroy() { this.destroyed = true; this.emit('disconnected'); }
        reconnect() { if (this.destroyed) throw new Error('destroyed'); }
      };
    });
    await page.waitForFunction(() => window.__fakePeers.length === 1, null, { timeout: 5000 });
    const r = await page.evaluate(() => {
      const h = window.__syncTestHooks;
      const peer = window.__fakePeers[0];
      const out = {};
      peer.emit('open');
      // Dial a peer that turns out to be offline.
      h.connect('RFR-ZZZ-ZZZ');
      out.dialing = h.connState().conn === window.__lastDial;
      peer.emit('error', { type: 'peer-unavailable' });
      out.droppedAfterUnavailable = h.connState().conn === null;
      out.dialClosed = window.__lastDial.closed;
      // That device comes online and dials us (already paired, so no banner).
      localStorage.setItem('rephrame_sync_room', 'RFR-ZZZ-ZZZ');
      const inbound = window.__mkConn('rephrame-zzzzzz', true);
      peer.emit('connection', inbound);
      out.inboundAccepted = h.connState().conn === inbound && !inbound.closed;
      out.stateSent = inbound.sent.some(m => m && m.type === 'state');
      out.statusConnected = h.connState().status === 'connected';
      // Now re-pair with a different device: the open link is replaced
      // without its own close handler scheduling a reconnect to it.
      h.connect('RFR-YYY-YYY');
      const after = h.connState();
      out.oldClosed = inbound.closed;
      out.newDial = after.conn === window.__lastDial && after.conn !== inbound;
      out.noReconnectTimer = after.reconnectScheduled === false;
      out.statusConnecting = after.status === 'connecting';
      return out;
    });
    assert.equal(r.dialing, true, 'syncConnect wires the outbound dial');
    assert.equal(r.droppedAfterUnavailable, true, 'peer-unavailable drops the dead dial from _conn');
    assert.equal(r.dialClosed, true, 'The dead dial is closed');
    assert.equal(r.inboundAccepted, true, 'A later inbound dial from the paired device is accepted, not rejected as glare');
    assert.equal(r.stateSent, true, 'Our state is sent on the accepted inbound link');
    assert.equal(r.statusConnected, true, 'Status reads connected');
    assert.equal(r.oldClosed, true, 'Re-pairing closes the previous link');
    assert.equal(r.newDial, true, '_conn now points at the new dial');
    assert.equal(r.noReconnectTimer, true, 'Closing the old link did not schedule an auto-reconnect');
    assert.equal(r.statusConnecting, true, 'Status reads connecting for the new dial');
    noErrors(errors, 'sync lifecycle');
    log('PASS — sync drops dead dials and replaces links without self-reconnect.');
    await ctx.close();
  }

  log('PASS — all regression assertions held.');
} catch (err) {
  failed = true;
  console.error('[regressions] FAIL — ' + (err && err.message ? err.message : err));
  if (err && err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
