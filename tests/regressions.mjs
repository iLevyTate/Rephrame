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
//  13. Sync connection lifecycle + handshake: a dead dial is dropped on
//      peer-unavailable; an inbound link from the paired device is wired but
//      stays silent until it proves the pairing secret; only ciphertext follows
//      the handshake; plaintext after it closes the link with no auto-redial; a
//      6-character legacy code is refused; a peer-unavailable for an OLD dial
//      doesn't tear down a newer one; destroying the peer doesn't reconnect.
//  14. Ctrl/Cmd+Enter inside the quick-capture modal saves the quick entry
//      instead of advancing the capture step underneath.
//  15. Delete → Undo doesn't splice a second copy when the entry is already
//      back (re-saved from an open editor). Clicking the toast's Undo with a
//      real pointer also proves toasts accept clicks (.toast-stack passes
//      pointer events through; .toast must re-enable them).
//  16. A shortcut launch delivered to an already-open window (launchQueue
//      targetURL) switches the view; ?openfile=1 behind a PIN lock waits for
//      the unlock instead of leaving a phantom modal.
//  17. A finished quick capture (family-less, estimated mood) still plots on
//      the sparkline; only the untouched placeholder row is skipped.
//  18. Service worker: navigating to a non-HTML file (/app.js) never replaces
//      the cached app shell.
//  19. Tapping a choice inside an open modal re-renders it in place: the
//      overlay and dialog elements survive (so their fadeIn / modalIn
//      entrance animations don't replay as a flash), the dialog keeps its
//      scroll offset, and the overlay doesn't collect a second close handler.
//  20. The capture shell carries no always-on entrance animation, so an
//      intra-step tap (picking a distortion) doesn't re-animate the card.
//  21. Keyboard avoidance never fights the user for the scroll position: once
//      they scroll by hand, a focused-but-unblurred field is not pulled back
//      into view by later visualViewport events.
//  22. The gradient-filled italic r keeps all of its ink. background-clip:
//      text paints only inside the element's background box, and the glyph's
//      ball terminal leans past its advance width, so the mark used to render
//      with the terminal sliced clean off.
//  23. A long scrolling dialog opens at its top. Settings' first form field is
//      the worry-window time picker ~550px down, and initial focus both
//      preferred it over anything on screen and scrolled it into view, so
//      Settings opened past its own heading with a time picker focused.
//  24. The capture footer actually sticks. overflow:hidden on .capture-shell
//      made it a clipping containing block, which silently cancels
//      position:sticky on its .capture-footer child, so Continue / Back /
//      Save scrolled away with the form — 1123px below the fold on Step 2 of
//      a 390x844 phone.
//  25. A pre-v2 sync pairing (room, no secret) is never dialled or accepted;
//      Settings shows the re-pairing notice and "generate" mints a new code.
//  26. With a PIN set, no peer registers and nothing dials while locked; a
//      good PIN starts sync, "Lock now" stops it.
//  27. Loaded inside another site's frame, the page shows an escape notice
//      and never boots the app (clickjacking guard; the meta CSP cannot carry
//      frame-ancestors).
//  28. A tapped field is lifted clear of the Android keyboard AND the sticky
//      chrome above it. interactive-widget=resizes-content shrinks
//      innerHeight along with the visual viewport, so the keyboard read as
//      0px tall: .kb-open never switched on, the nav and the Continue bar
//      stayed parked above the keyboard, and the field typed into sat
//      143px behind them.
//  29. A <details> expander opened near the bottom of a step unfolds into
//      view instead of under the sticky Continue bar.
//  30. Every distortion's pre-set question and reframe exist and fit it (no
//      responsibility pie for All-or-Nothing), the old "Zoom out (pie
//      chart)" / "Perspective broadening" names migrate, and the intensity
//      cues describe felt experience rather than how someone sounds.
//      Picking a distortion never writes a stock reframe into the entry, and
//      "Historical test" / "Minimization" migrate; 0 reads as None.
//  31. Crisis resources list the US Lifeline and Canada's 9-8-8 separately,
//      use each country's text-line keyword, and carry no dead links.
//  32. The follow-through pieces the clinical review asked for: the
//      "facts back this up" choice returns after the evidence on Step 4,
//      new feelings after the reframe and a prediction before the pivot are
//      saved and exported, a worry postponed twice suggests working it
//      through, a stored "Jealousy" mood migrates to "Jealousy & envy", and
//      the activity types include work/study and meaning.
//  33. A collapsed entry card is just its head. The grid-rows collapse held
//      two padded children, so every "collapsed" card showed a strip of body
//      and a full, inert Edit / Copy / Delete bar.
//  34. Switching from one dialog to another (Settings → Set PIN) keeps the
//      overlay mounted: its fade-in used to restart from 0, blinking the
//      page through between the dialogs. Focus moves into the new dialog.
//  35. The Undo countdown bar runs. Its end state was set before the bar
//      had ever been styled, so it sat at scaleX(0), invisible, from the
//      first frame. It also sits inside the pill's rounded ends now.
//  36. When a toast leaves, the toasts above glide into its space instead
//      of dropping a whole toast-height in one frame.
//  37. Pinning the first coping card (or unpinning the last) holds the tapped
//      card still while the ~300px strip appears or goes above it.
//  38. A view change lands at the top of the new view under its fade-in,
//      instead of smooth-scrolling through it; re-tapping the current tab
//      still scrolls up smoothly.
//  39. Patterns charts draw in when the view opens, and a background
//      re-render doesn't replay them.
//  40. The PIN field shakes once per failed try (not again on "Forgot PIN?"),
//      and unlocking fades the lock screen off without leaving its PIN field
//      findable.
//  41. Deleting an entry holds its space with a placeholder that closes, so
//      the entries below move up instead of snapping.
//
// Runs in CI (.github/workflows/smoke.yml) and locally via `npm run regressions`
// after `npm run serve` in another shell.
//
// Env:
//   SMOKE_URL  default http://localhost:8765/index.html
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

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

// Minimal PNG reader for block 22 — enough for what page.screenshot() emits
// (8-bit, non-interlaced, RGB or RGBA) and nothing more, so the suite keeps
// its zero-runtime-dependency footprint.
function decodePng(buf) {
  let p = 8, w = 0, h = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  assert.ok(depth === 8 && interlace === 0 && (colorType === 2 || colorType === 6),
    `Screenshot PNG is 8-bit non-interlaced RGB/RGBA (got depth=${depth} colorType=${colorType} interlace=${interlace})`);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[o++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[o + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v;
      if (filter === 0) v = cur;
      else if (filter === 1) v = cur + a;
      else if (filter === 2) v = cur + b;
      else if (filter === 3) v = cur + ((a + b) >> 1);
      else {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      px[y * stride + x] = v & 255;
    }
    o += stride;
  }
  return { w, h, bpp, px };
}

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

  // ── 13. Sync connection lifecycle + handshake (fake PeerJS) ─────────────
  {
    const SECRET = '0123456789AB';
    const { ctx, page, errors } = await openApp(() => {
      // This device becomes the guest of room ZZZZZZ below, through the test
      // hook that turns the secret into keys (nothing seeds it in the clear).
      localStorage.setItem('rephrame_peer_id_v1', 'rephrame-aaaaaa');
      window.__fakePeers = [];
      window.__mkConn = (peer, open) => ({
        peer, open, closed: false, sent: [], _h: {},
        on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; },
        off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter(f => f !== fn); return this; },
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
    await page.evaluate(async (secret) => {
      const h = window.__syncTestHooks;
      await h.installPairing({ room: 'ZZZZZZ', secret, peer: 'rephrame-zzzzzz', verified: true });
      h.enable();
    }, SECRET);
    await page.waitForFunction(() => window.__fakePeers.length === 1, null, { timeout: 5000 });
    const r = await page.evaluate(async (secret) => {
      const h = window.__syncTestHooks;
      const peer = window.__fakePeers[0];
      const out = {};
      const wait = (fn, ms = 4000) => new Promise((res, rej) => {
        const t0 = Date.now();
        (function tick() { if (fn()) return res(); if (Date.now() - t0 > ms) return rej(new Error('timeout')); setTimeout(tick, 10); })();
      });
      peer.emit('open');
      // Boot auto-dials the paired device…
      out.autoDialed = h.connState().conn === window.__lastDial && window.__lastDial.peer === 'rephrame-zzzzzz';
      // …which turns out to be offline.
      peer.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer rephrame-zzzzzz' });
      out.droppedAfterUnavailable = h.connState().conn === null;
      out.dialClosed = window.__lastDial.closed;
      // That device comes online and dials us (known peer, so no banner) —
      // but nothing is sent until it proves the secret.
      const inbound = window.__mkConn('rephrame-zzzzzz', true);
      peer.emit('connection', inbound);
      out.inboundWired = h.connState().conn === inbound && !inbound.closed;
      out.silentBeforeHello = inbound.sent.length === 0;
      // Play the dialler's side of the handshake with the real keys.
      const keys = await h.deriveKeys(secret, 'ZZZZZZ');
      const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
      inbound.emit('data', { type: 'hello', v: 2, nonce });
      await wait(() => inbound.sent.length >= 1);
      const ack = inbound.sent[0];
      out.ackType = ack.type;
      out.ackProofValid = await h.verifyProof(keys.mac, 'ack', nonce, ack.proof);
      out.notReadyYet = inbound.sent.length === 1 && !h.connState().ready;
      inbound.emit('data', { type: 'hello-ok', v: 2, proof: await h.makeProof(keys.mac, 'ok', ack.nonce) });
      await wait(() => h.connState().ready && inbound.sent.length >= 2);
      out.statusConnected = h.connState().status === 'connected';
      const after = inbound.sent.slice(1);
      out.onlyCiphertextAfter = after.every(m => m.type === 'enc' && m.v === 2);
      out.noPlaintextState = !JSON.stringify(inbound.sent).includes('entries');
      const inner = await h.decrypt(keys, h.aadFor(nonce, ack.nonce, 'responder'), after[0]);
      out.firstIsState = inner.type === 'state' && Array.isArray(inner.payload.entries);
      // Plaintext after the handshake closes the link, with no auto-redial.
      inbound.emit('data', { type: 'patch', payload: { entries: [] } });
      await wait(() => h.connState().conn === null);
      out.closedOnPlaintext = inbound.closed;
      out.statusError = h.connState().status === 'error';
      out.noReconnectTimer = h.connState().reconnectScheduled === false;
      // An old-format code is refused outright…
      await h.connect('RFR-ZZZ-ZZZ');
      out.legacyRefused = h.connState().conn === null && /older version/.test(h.connState().statusMsg);
      // …while a full code re-pairs: the new dial replaces everything, no
      // reconnect timer, status connecting, and the pairing record follows —
      // holding the room and partner id but never the secret.
      await h.connect('YYY-YYY-' + secret.slice(0, 4) + '-' + secret.slice(4, 8) + '-' + secret.slice(8));
      const st = h.connState();
      // The typed code (room + secret) reaches web storage nowhere: the
      // record is in IndexedDB and localStorage keeps only the device id,
      // tombstones and the enabled flag.
      const idbGet = (key) => new Promise((res, rej) => {
        const r = indexedDB.open('rephrame-sync');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const db = r.result;
          let g;
          try { g = db.transaction('keys', 'readonly').objectStore('keys').get(key); } catch (e) { db.close(); rej(e); return; }
          g.onsuccess = () => { db.close(); res(g.result); };
          g.onerror = () => { db.close(); rej(g.error); };
        };
      });
      const rec = await idbGet('pairing');
      out.recordInIdbOnly = !!rec && rec.room === 'YYYYYY' && rec.peer === 'rephrame-yyyyyy' && !('secret' in rec) &&
        localStorage.getItem('rephrame_sync_pair_v2') === null &&
        Object.keys(localStorage).every(k => !String(localStorage.getItem(k)).includes(secret) && !String(localStorage.getItem(k)).includes('YYYYYY'));
      out.newDial = st.conn === window.__lastDial && window.__lastDial.peer === 'rephrame-yyyyyy';
      out.noReconnectTimer2 = st.reconnectScheduled === false;
      out.statusConnecting = st.status === 'connecting';
      out.pairingFollows = !!st.pairing && st.pairing.room === 'YYYYYY' && st.pairing.peer === 'rephrame-yyyyyy' && st.pairing.verified === false;
      return out;
    }, SECRET);
    assert.equal(r.autoDialed, true, 'Boot auto-dials the paired device');
    assert.equal(r.droppedAfterUnavailable, true, 'peer-unavailable drops the dead dial from _conn');
    assert.equal(r.dialClosed, true, 'The dead dial is closed');
    assert.equal(r.inboundWired, true, 'A later inbound dial from the paired device is wired, not rejected as glare');
    assert.equal(r.silentBeforeHello, true, 'Nothing is sent on an inbound link before its hello');
    assert.equal(r.ackType, 'hello-ack', 'A valid hello is answered with hello-ack');
    assert.equal(r.ackProofValid, true, 'The hello-ack carries a valid HMAC proof over the dialler nonce');
    assert.equal(r.notReadyYet, true, 'The link is not ready until the dialler proves the secret too');
    assert.equal(r.statusConnected, true, 'Status reads connected after both proofs');
    assert.equal(r.onlyCiphertextAfter, true, 'Only enc messages follow the handshake');
    assert.equal(r.noPlaintextState, true, 'The journal never appears in plaintext');
    assert.equal(r.firstIsState, true, 'The first ciphertext decrypts to the state snapshot');
    assert.equal(r.closedOnPlaintext, true, 'A plaintext message after the handshake closes the link');
    assert.equal(r.statusError, true, 'Status reads error after a protocol violation');
    assert.equal(r.noReconnectTimer, true, 'No auto-reconnect after a protocol violation');
    assert.equal(r.legacyRefused, true, 'A 6-character legacy code is refused with an explanation');
    assert.equal(r.newDial, true, '_conn now points at the new dial');
    assert.equal(r.noReconnectTimer2, true, 'Re-pairing did not schedule an auto-reconnect');
    assert.equal(r.statusConnecting, true, 'Status reads connecting for the new dial');
    assert.equal(r.pairingFollows, true, 'The pairing record follows the code that was entered');
    assert.equal(r.recordInIdbOnly, true, 'The pairing record lives in IndexedDB only; nothing from the typed code reaches localStorage');

    const r2 = await page.evaluate(async () => {
      const h = window.__syncTestHooks;
      const peer = window.__fakePeers[0];
      const out = {};
      // A late EXPIRE for the earlier rephrame-zzzzzz dial must not kill the
      // live rephrame-yyyyyy dial.
      const live = h.connState().conn;
      peer.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer rephrame-zzzzzz' });
      out.liveKept = h.connState().conn === live && !live.closed;
      // ...but one naming the current dial does drop it.
      peer.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer rephrame-yyyyyy' });
      out.currentDropped = h.connState().conn === null && live.closed;
      // Peer torn down by PeerJS itself (fatal error → destroy) emits
      // "disconnected" before its destroyed flag flips; the error shown must
      // survive and no reconnect may be attempted.
      peer.emit('error', { type: 'browser-incompatible' });
      peer.reconnectCalls = 0;
      const origReconnect = peer.reconnect;
      peer.reconnect = function () { this.reconnectCalls++; return origReconnect.call(this); };
      peer.emit('disconnected'); peer.destroyed = true;   // real order: emit, then flag
      await new Promise(r => setTimeout(r, 0));
      out.statusStillError = h.connState().status === 'error';
      out.noReconnect = peer.reconnectCalls === 0;
      return out;
    });
    assert.equal(r2.liveKept, true, 'peer-unavailable for an older dial leaves the current dial alone');
    assert.equal(r2.currentDropped, true, 'peer-unavailable naming the current dial drops it');
    assert.equal(r2.statusStillError, true, 'A destroyed peer does not flip the status back to waiting');
    assert.equal(r2.noReconnect, true, 'A destroyed peer is not asked to reconnect');
    noErrors(errors, 'sync lifecycle');
    log('PASS — sync proves the pairing secret before any data and drops dead or unproven links.');
    await ctx.close();
  }

  // ── 14. Ctrl/Cmd+Enter inside the quick modal ─────────────────────────
  {
    const { ctx, page, errors } = await openApp();
    await page.locator('[data-nav="capture"]').click();
    await page.locator('textarea[data-field="trigger"]').fill('a trigger');
    await page.locator('[data-action="open-quick"]').click();
    await page.waitForSelector('#quickThought', { timeout: 5000 });
    await page.locator('#quickThought').fill('quick thought');
    await page.locator('#quickThought').press('Control+Enter');
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({
      step: state.captureStep,
      modal: state.modal,
      saved: state.entries.some(e => e.isQuick && (e.thoughts[0] || {}).text === 'quick thought'),
    }));
    assert.equal(r.step, 1, 'Capture step underneath did not advance');
    assert.equal(r.modal, null, 'Quick modal closed on Ctrl+Enter');
    assert.equal(r.saved, true, 'Ctrl+Enter saved the quick capture');
    noErrors(errors, 'ctrl+enter');
    log('PASS — Ctrl+Enter in the quick modal saves it, not the capture step behind it.');
    await ctx.close();
  }

  // ── 15. Undo after the entry is already back ───────────────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'dup1', kind: 'freeform', createdAt: '2024-06-01T10:00:00.000Z', body: 'edit me' },
      ]));
    });
    await page.locator('[data-nav="journal"]').click();
    await page.locator('#entry-dup1 .entry-card-head').click();
    await page.locator('[data-action="edit"][data-id="dup1"]').click();
    await page.waitForSelector('textarea[data-field="body"]', { timeout: 5000 });
    // Leave the editor open, go delete the entry from the journal (the card
    // is still expanded from before, so Delete is already visible).
    await page.locator('[data-nav="journal"]').click();
    await page.locator('[data-action="delete"][data-id="dup1"]').click();
    await page.locator('[data-action="confirm-delete"]').click();
    await page.waitForSelector('.toast-action', { timeout: 5000 });
    // Back to the still-open editor and save: the entry is re-inserted.
    await page.locator('[data-nav="capture"]').click();
    await page.locator('[data-action="save-entry"]').click();
    await page.waitForTimeout(100);
    // Now Undo the delete.
    await page.locator('.toast-action').first().click();
    await page.waitForTimeout(150);
    const copies = await page.evaluate(() => state.entries.filter(e => e.id === 'dup1').length);
    assert.equal(copies, 1, 'Undo does not create a second entry with the same id');
    noErrors(errors, 'undo duplicate');
    log('PASS — undo skips an entry that is already back.');
    await ctx.close();
  }

  // ── 16. In-app launch event + openfile behind the lock ─────────────────
  {
    const { ctx, page, errors } = await openApp();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('rephrame:launch', { detail: location.origin + '/?nav=patterns' })));
    assert.equal(await page.evaluate(() => state.view), 'patterns', 'A launch delivered to an open window switches the view');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('rephrame:launch', { detail: location.origin + '/?openfile=1' })));
    assert.equal(await page.evaluate(() => state.modal), 'import', 'A file launch delivered to an open window opens Import');
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await ctx2.addInitScript(ONBOARDED);
    const page2 = await ctx2.newPage();
    await page2.goto(URL, { waitUntil: 'domcontentloaded' });
    await page2.waitForSelector('.app', { timeout: 10000 });
    await page2.evaluate(async () => { await setStoredPin('2468'); sessionStorage.removeItem('reframe-unlocked'); });
    await page2.goto(URL + '?openfile=1', { waitUntil: 'domcontentloaded' });
    await page2.waitForSelector('#lockPinInput', { timeout: 10000 });
    assert.equal(await page2.evaluate(() => state.modal), null, 'No phantom Import modal behind the lock screen');
    await page2.locator('#lockPinInput').fill('246');
    await page2.locator('#lockPinInput').press('Escape');
    assert.equal(await page2.locator('#lockPinInput').inputValue(), '246', 'Escape on the lock screen does not wipe the typed PIN');
    await page2.locator('#lockPinInput').fill('2468');
    await page2.locator('#lockForm button[type="submit"]').click();
    await page2.waitForSelector('[data-action="import-merge"]', { timeout: 10000 });
    assert.equal(await page2.evaluate(() => state.modal), 'import', 'Import modal opens once unlocked');
    log('PASS — launch events reach an open window; openfile waits for unlock.');
    await ctx2.close();
    noErrors(errors, 'launch');
  }

  // ── 17. Finished quick capture still plots ─────────────────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      const rec = (id, hoursAgo, moods) => ({
        id, kind: 'thought-record', createdAt: new Date(Date.now() - hoursAgo * 3600e3).toISOString(),
        trigger: 'x', thoughts: [{ id: id + 't', text: 'thought', isHot: true }], moods,
      });
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        rec('q1', 1, [{ id: 'm1', family: '', variant: '', intensity: 85, estimated: true }]),   // finished quick capture
        rec('q2', 2, [{ id: 'm2', family: 'Anxiety', variant: '', intensity: 60 }]),
        rec('q3', 3, [{ id: 'm3', family: '', variant: '', intensity: 40 }]),                    // untouched placeholder
      ]));
    });
    await page.locator('[data-nav="patterns"]').click();
    await page.waitForSelector('.patterns-grid', { timeout: 5000 });
    assert.equal(await page.locator('.spark-wrap circle').count(), 2, 'Quick-capture intensity plots; the placeholder row does not');
    noErrors(errors, 'sparkline quick');
    log('PASS — finished quick captures still plot on the sparkline.');
    await ctx.close();
  }

  // ── 18. Service worker never caches a non-HTML navigation as the shell ──
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await ctx.addInitScript(ONBOARDED);
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
    // Open the script itself as a document, as someone reading the source would.
    await page.goto(URL.replace(/index\.html$/, 'app.js'), { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const r = await page.evaluate(async () => {
      const keys = (await window.caches.keys()).filter(k => /^reframe-v\d+$/.test(k));
      const c = await window.caches.open(keys[0]);
      const res = await c.match('./index.html');
      const body = res ? await res.text() : '';
      return { served: document.body.textContent.slice(0, 40), shellOk: /^\s*<!DOCTYPE html>/i.test(body) };
    });
    assert.ok(!/<!DOCTYPE/i.test(r.served), 'Navigating to app.js serves the script, not the cached shell');
    assert.equal(r.shellOk, true, 'Cached index.html is still HTML after navigating to a non-HTML file');
    log('PASS — service worker keeps the app shell intact.');
    await ctx.close();
  }

  // ── 19. An open modal re-renders in place (no flash, no scroll reset) ───
  {
    const { ctx, page, errors } = await openApp();
    await page.locator('[data-action="open-settings"]').first().click();
    await page.waitForSelector('.modal-overlay [data-action="set-reminder"]', { timeout: 5000 });
    // Tag the live nodes, scroll the long dialog down, and put the caret in a
    // field. If the re-render rebuilds #modal-root, the tags vanish with the
    // old elements — and with them go the entrance animations that made the
    // dialog flash — while the scroll offset and the caret reset too. The tap
    // is dispatched in-page so Playwright's own scroll-into-view can't move
    // the dialog behind our back.
    const before = await page.evaluate(() => {
      document.querySelector('.modal-overlay').dataset.tag = 'overlay-1';
      document.querySelector('.modal').dataset.tag = 'modal-1';
      const modal = document.querySelector('.modal');
      modal.scrollTop = 200;
      document.querySelector('[data-action="set-worry-window-time"]').focus();
      return modal.scrollTop;
    });
    assert.ok(before > 0, 'Settings is long enough to scroll (precondition)');
    await page.evaluate(() =>
      document.querySelector('[data-action="set-reminder"][data-value="weekly"]').click());
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => {
      const overlay = document.querySelector('.modal-overlay');
      const modal = document.querySelector('.modal');
      return {
        overlayTag: overlay && overlay.dataset.tag,
        modalTag: modal && modal.dataset.tag,
        scrollTop: modal ? modal.scrollTop : -1,
        focused: document.activeElement && document.activeElement.dataset.action,
        active: !!document.querySelector('[data-action="set-reminder"][data-value="weekly"].active'),
        setting: state.settings.reminderInterval,
      };
    });
    assert.equal(r.overlayTag, 'overlay-1', 'Overlay element survives the re-render (fadeIn does not replay)');
    assert.equal(r.modalTag, 'modal-1', 'Dialog element survives the re-render (modalIn does not replay)');
    assert.equal(r.setting, 'weekly', 'The tapped choice was applied');
    assert.equal(r.active, true, 'The tapped choice is re-rendered as active');
    assert.equal(r.focused, 'set-worry-window-time', 'The field being edited keeps focus across the re-render');
    assert.ok(Math.abs(r.scrollTop - before) <= 2, `Dialog keeps its scroll offset (${before} → ${r.scrollTop})`);
    // The overlay outlives the re-render, so its close handler must not stack:
    // one click on it closes the dialog exactly once, with no error from a
    // second handler running against an already-closed modal.
    await page.evaluate(() => { window.__closes = 0; const o = document.querySelector('.modal-overlay'); o.addEventListener('click', () => window.__closes++, true); });
    await page.mouse.click(10, 10);
    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => state.modal), null, 'Overlay click still closes the modal');
    noErrors(errors, 'modal in-place re-render');
    log('PASS — an open modal re-renders in place, keeping scroll and skipping the entrance animation.');
    await ctx.close();
  }

  // ── 20. Capture shell has no always-on entrance animation ──────────────
  {
    const { ctx, page, errors } = await openApp();
    await page.locator('[data-nav="capture"]').first().click();
    await page.waitForSelector('.capture-shell', { timeout: 5000 });
    // Let the view-entering animation (which is correct — the view really did
    // change) finish, then tap inside the step.
    await page.waitForTimeout(500);
    const shellAnim = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.capture-shell')).animationName);
    assert.equal(shellAnim, 'none', 'The capture shell carries no always-on entrance animation');
    // Step 2 has an "add another mood" control: tapping it re-renders the
    // view without changing step, which is the case that used to flash.
    await page.locator('.capture-screen textarea').first().fill('a trigger happened today');
    await page.locator('[data-action="next-step"]').first().click();
    await page.waitForSelector('[data-action="add-mood"]', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.querySelector('.capture-shell').dataset.tag = 'shell-1'; });
    await page.locator('[data-action="add-mood"]').first().click();
    await page.waitForTimeout(60);
    const r = await page.evaluate(() => {
      const shell = document.querySelector('.capture-shell');
      return {
        rebuilt: shell.dataset.tag !== 'shell-1',
        running: shell.getAnimations().length,
        step: state.captureStep,
      };
    });
    assert.equal(r.rebuilt, true, 'The tap really re-rendered the view (precondition)');
    assert.equal(r.step, 2, 'The tap did not change step, so nothing should animate');
    // An entrance animation restarted by the re-render would still be running.
    assert.equal(r.running, 0, 'Tapping inside a step re-animates nothing on the capture shell');
    noErrors(errors, 'capture shell animation');
    log('PASS — an intra-step tap does not re-animate the capture shell.');
    await ctx.close();
  }

  // ── 21. Keyboard avoidance yields the scroll position to the user ──────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify(
        Array.from({ length: 14 }, (_, i) => ({
          id: 'e' + i, kind: 'free',
          createdAt: '2024-06-0' + ((i % 9) + 1) + 'T1' + (i % 10) + ':00:00.000Z',
          freeText: 'entry body ' + i + ' ' + 'padding '.repeat(20),
        }))
      ));
    });
    await page.locator('[data-nav="journal"]').first().click();
    await page.waitForSelector('.journal-search', { timeout: 5000 }).catch(() => {});
    const setup = await page.evaluate(() => {
      const field = document.querySelector('input, textarea');
      if (!field) return { ok: false };
      field.focus();
      // Pretend the soft keyboard is up: the handler reads its height from
      // visualViewport, and only a *height change* may move the page.
      Object.defineProperty(window.visualViewport, 'height', {
        configurable: true, get: () => window.innerHeight - 320,
      });
      window.visualViewport.dispatchEvent(new Event('resize'));
      return { ok: true, scrollable: document.documentElement.scrollHeight > window.innerHeight + 500 };
    });
    assert.equal(setup.ok, true, 'Found a field to focus (precondition)');
    assert.equal(setup.scrollable, true, 'Journal is taller than the viewport (precondition)');
    // Let the initial reveal-the-field scroll settle before measuring.
    await page.waitForTimeout(700);
    // The user scrolls away without blurring the field — the exact case that
    // used to snap the page straight back to it. Read the position back
    // synchronously: the yank arrived on a later task, off the scroll the
    // browser itself reports to visualViewport.
    const parked = await page.evaluate(() => {
      window.dispatchEvent(new Event('touchmove'));
      window.scrollTo({ top: 400, behavior: 'auto' });
      return window.scrollY;
    });
    assert.ok(parked > 300, `The page really scrolled away from the field (at ${parked})`);
    // Every event the keyboard code listens to, short of a fresh focus.
    await page.evaluate(() => {
      window.visualViewport.dispatchEvent(new Event('scroll'));
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({
      y: window.scrollY,
      stillFocused: document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName),
    }));
    assert.equal(after.stillFocused, true, 'The field is still focused (precondition for the bug)');
    assert.ok(Math.abs(after.y - parked) <= 4, `Page stays where the user scrolled it (${parked} → ${after.y})`);
    noErrors(errors, 'keyboard avoidance');
    log('PASS — a hand-scrolled page is not pulled back to a still-focused field.');
    await ctx.close();
  }

  // ── 22. The gradient mark keeps its ball terminal ──────────────────────
  // Shoot each mark as shipped, then again with the gradient swapped for a
  // flat opaque fill, and compare the two ink masks. Anything inked in the
  // solid pass but bare in the gradient pass fell outside the background box
  // and never got painted — which is exactly how the r lost its terminal.
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 4 });
    await ctx.addInitScript(ONBOARDED);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.empty-state-mark', { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);

    // Copper against the warm paper/ink backgrounds: red and blue diverge
    // hard on the glyph and barely at all on either background, so the red
    // minus blue gap is a reliable "is this pixel inked" test in both themes.
    const isInk = (img, i) => Math.abs(img.px[i] - img.px[i + 2]) > 26;

    for (const sel of ['.brand-mark', '.empty-state-mark']) {
      const mark = page.locator(sel).first();
      const shipped = decodePng(await mark.screenshot());
      const flat = await page.addStyleTag({ content: `
        .brand-mark, .empty-state-mark::before {
          background-image: none !important;
          -webkit-text-fill-color: #b8552c !important;
          color: #b8552c !important;
          text-shadow: none !important;
        }` });
      await page.waitForTimeout(150);
      const solid = decodePng(await mark.screenshot());
      await flat.evaluate((node) => node.remove());
      await page.waitForTimeout(150);

      assert.equal(`${shipped.w}x${shipped.h}`, `${solid.w}x${solid.h}`,
        `${sel} keeps its box size when the gradient is swapped out`);
      let inked = 0, unpainted = 0;
      for (let i = 0; i < solid.w * solid.h * solid.bpp; i += solid.bpp) {
        if (!isInk(solid, i)) continue;
        inked++;
        if (!isInk(shipped, i)) unpainted++;
      }
      assert.ok(inked > 200, `${sel} actually rendered a glyph to measure (${inked} ink px)`);
      // 1% absorbs the antialiasing that shifts when the glow comes off; the
      // clipped terminal cost ~12% of the hero mark.
      const lost = (100 * unpainted) / inked;
      assert.ok(lost < 1, `${sel} paints its whole glyph (${lost.toFixed(2)}% of ink unpainted)`);
    }
    noErrors(errors, 'gradient mark');
    log('PASS — both gradient brand marks paint their full glyph.');
    await ctx.close();
  }

  // ── 23. A long dialog opens at its top ────────────────────────────────
  {
    const { ctx, page, errors } = await openApp();
    const open = async (sel) => {
      await page.locator(sel).first().click();
      await page.waitForTimeout(500);
      return page.evaluate(() => {
        const m = document.querySelector('.modal');
        const a = document.activeElement;
        return {
          scrollTop: Math.round(m.scrollTop),
          overflows: m.scrollHeight > m.clientHeight + 2,
          focusInModal: m.contains(a),
          focusTag: a ? a.tagName.toLowerCase() : null,
          focusAction: a && a.dataset ? (a.dataset.action || null) : null,
        };
      });
    };

    const settings = await open('[data-action="open-settings"]');
    assert.equal(settings.overflows, true, 'Settings is long enough to scroll (precondition)');
    assert.equal(settings.scrollTop, 0, 'Settings opens at its top, not scrolled to the time picker');
    assert.equal(settings.focusInModal, true, 'Initial focus stays inside the dialog');
    assert.equal(settings.focusAction, 'set-theme',
      'Focus lands on the first control that is actually on screen, not the buried time input');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // The quick-capture modal's first field IS at the top, and focusing it is
    // the whole point — the in-view rule must not take that away.
    const quick = await open('[data-action="open-quick"]');
    assert.equal(quick.scrollTop, 0, 'Quick capture opens at its top');
    assert.equal(quick.focusTag, 'textarea', 'Quick capture still focuses its textarea');
    noErrors(errors, 'modal initial focus');
    log('PASS — a long dialog opens at its top with focus on something visible.');
    await ctx.close();
  }

  // ── 24. The capture footer actually sticks ────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(ONBOARDED);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });

    // Where the primary action sits WITHOUT scrolling — the whole point of the
    // footer's sticky is that you never have to.
    const primary = () => page.evaluate(() => {
      const b = document.querySelector('[data-action="next-step"], [data-action="save-entry"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { mid: r.top + r.height / 2, vh: window.innerHeight, scrollY: window.scrollY };
    });

    await page.locator('.nav-item[data-nav="capture"]').click();
    await page.waitForTimeout(400);
    await page.locator('textarea[data-field="trigger"]').fill('Sent a long, honest text three days ago. Still no reply.');
    await page.waitForTimeout(150);

    const s1 = await primary();
    assert.ok(s1, 'Step 1 renders a primary footer action');
    assert.equal(s1.scrollY, 0, 'Step 1 starts unscrolled (precondition)');
    assert.ok(s1.mid > 0 && s1.mid < s1.vh,
      `Step 1 Continue is on screen without scrolling (mid ${Math.round(s1.mid)} of ${s1.vh})`);

    await page.locator('[data-action="next-step"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-action="edit-thought-text"]').first().fill("I overshared. They're pulling away.");
    await page.locator('[data-action="edit-mood-family"]').first().selectOption('Anxiety');
    await page.waitForTimeout(150);
    await page.locator('[data-action="edit-mood-variant"]').first().selectOption('worried');
    await page.waitForTimeout(350);

    const s2 = await primary();
    // Step 2 is the long one — it is why the footer is sticky at all.
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    assert.ok(scrollable > 400, `Step 2 is long enough to need a sticky footer (${scrollable}px of scroll)`);
    assert.equal(s2.scrollY, 0, 'Step 2 starts unscrolled (precondition)');
    assert.ok(s2.mid > 0 && s2.mid < s2.vh,
      `Step 2 Continue is on screen without scrolling (mid ${Math.round(s2.mid)} of ${s2.vh})`);

    // And the shell must not re-acquire a clip, which is what broke it.
    const clips = await page.evaluate(() => {
      const shell = document.querySelector('.capture-shell');
      const cs = getComputedStyle(shell);
      return cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    });
    assert.equal(clips, false,
      '.capture-shell does not clip — a clipping containing block cancels the footer\'s sticky');

    noErrors(errors, 'sticky capture footer');
    log('PASS — the capture footer stays on screen on a phone, Step 1 and Step 2.');
    await ctx.close();
  }

  // ── 25. A pre-v2 sync pairing is retired, not dialled ──────────────────
  {
    const { ctx, page, errors } = await openApp(() => {
      // Seed the pre-v2 state once: this init script also runs on the reload
      // further down, which must see the freshly generated pairing, not the
      // legacy one again.
      if (!localStorage.getItem('__test_seeded')) {
        localStorage.setItem('__test_seeded', '1');
        localStorage.setItem('rephrame_sync_enabled', '1');
        localStorage.setItem('rephrame_peer_id_v1', 'rephrame-abcdef');
        localStorage.setItem('rephrame_sync_room', 'RFR-ZZZ-ZZZ');
      }
      window.__fakePeers = [];
      window.Peer = class {
        constructor(id) { this.id = id; window.__fakePeers.push(this); }
        on() { return this; }
        connect() { throw new Error('a legacy pairing must never be dialled'); }
        destroy() {}
      };
    });
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ peers: window.__fakePeers.length, legacy: window.__syncTestHooks.connState().legacy }));
    assert.equal(st.peers, 0, 'No peer is registered for a secret-less pairing');
    assert.equal(st.legacy, true, 'The pairing is recognised as legacy');
    await page.locator('[data-action="open-settings"]').first().click();
    await page.waitForSelector('#syncPanel #syncRegenBtn', { timeout: 5000 });
    const text = await page.locator('#syncPanel').innerText();
    assert.match(text, /re-pairing needed/i, 'Settings shows the re-pairing notice');
    assert.match(text, /Security update/i, 'The notice explains why');
    // Generating a new code mints a room + secret, retires the legacy record
    // and registers the new id.
    await page.locator('#syncRegenBtn').click();
    await page.waitForSelector('#syncMyCode', { timeout: 5000 });
    await page.waitForFunction(() => window.__fakePeers.length === 1, null, { timeout: 5000 });
    const after = await page.evaluate(async () => {
      const code = document.getElementById('syncMyCode').textContent.trim();
      const secretPart = code.replace(/-/g, '').slice(6);
      // The pairing record and the derived keys both live in real IndexedDB.
      const idbGet = (key) => new Promise((res, rej) => {
        const r = indexedDB.open('rephrame-sync');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const db = r.result;
          let g;
          try { g = db.transaction('keys', 'readonly').objectStore('keys').get(key); } catch (e) { db.close(); rej(e); return; }
          g.onsuccess = () => { db.close(); res(g.result); };
          g.onerror = () => { db.close(); rej(g.error); };
        };
      });
      const p = await idbGet('pairing');
      const keys = await idbGet('keys');
      return {
        room: p ? p.room : null, peer: p ? p.peer : undefined, recordKeys: p ? Object.keys(p).sort() : [],
        secretLen: secretPart.length,
        secretInStorage: Object.keys(localStorage).some(k => String(localStorage.getItem(k)).includes(secretPart)),
        noLocalRecord: localStorage.getItem('rephrame_sync_pair_v2') === null,
        localKeys: Object.keys(localStorage).sort(),
        legacyGone: localStorage.getItem('rephrame_sync_room') === null,
        code,
        id: localStorage.getItem('rephrame_peer_id_v1'),
        registered: window.__fakePeers[0].id,
        keysRoom: keys ? keys.room : null,
        keysNonExtractable: !!keys && keys.aes instanceof CryptoKey && keys.aes.extractable === false &&
          keys.mac instanceof CryptoKey && keys.mac.extractable === false,
        keysAlgo: keys ? keys.aes.algorithm.name + '+' + keys.mac.algorithm.name : '',
      };
    });
    assert.equal(after.secretLen, 12, 'The panel shows a 12-character secret');
    assert.deepEqual(after.recordKeys, ['peer', 'room', 'verified'], 'The IndexedDB pairing record holds room, peer and verified only');
    assert.equal(after.noLocalRecord, true, 'There is no rephrame_sync_pair_v2 key in localStorage');
    assert.deepEqual(after.localKeys.filter(k => k.startsWith('rephrame_')), ['rephrame_peer_id_v1', 'rephrame_sync_enabled'],
      'localStorage keeps only the device id and the enabled flag (plus tombstones once there are any)');
    assert.equal(after.secretInStorage, false, 'The secret appears in no localStorage value');
    assert.equal(after.keysRoom, after.room, 'IndexedDB holds the keys for the new room');
    assert.equal(after.keysNonExtractable, true, 'The stored keys are non-extractable CryptoKeys');
    assert.equal(after.keysAlgo, 'AES-GCM+HMAC', 'An AES-GCM key and an HMAC key are stored');
    // After a reload the code is gone with the page (the secret was never
    // stored), but the keys come back from IndexedDB: the device registers
    // under the same id and the panel explains where the code went.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.waitForFunction(() => window.__fakePeers.length === 1, null, { timeout: 5000 });
    await page.locator('[data-action="open-settings"]').first().click();
    await page.waitForSelector('#syncPanel #syncRegenBtn', { timeout: 5000 });
    const reloaded = await page.evaluate(() => ({
      id: window.__fakePeers[0].id,
      codeShown: !!document.getElementById('syncMyCode'),
      text: document.getElementById('syncPanel').innerText,
      pairing: window.__syncTestHooks.connState().pairing,
    }));
    assert.equal(reloaded.id, after.id, 'After a reload the device registers under the same id (keys read back from IndexedDB)');
    assert.equal(reloaded.codeShown, false, 'The pairing code is not shown again after a reload');
    assert.match(reloaded.text, /only shown right after it is generated/, 'The panel explains that the code is shown once');
    assert.equal(reloaded.pairing && reloaded.pairing.room, after.room, 'The pairing record survived the reload');
    assert.equal(after.peer, null, 'The new pairing has no partner yet');
    assert.equal(after.legacyGone, true, 'The legacy room record is removed');
    assert.equal(after.id, 'rephrame-' + after.room.toLowerCase(), 'The new room id is the device id');
    assert.equal(after.registered, after.id, 'The peer registers under the new id');
    assert.match(after.code, /^[0-9A-Z]{3}-[0-9A-Z]{3}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/, 'The panel shows the full pairing code');
    assert.ok(after.code.startsWith(after.room.slice(0, 3) + '-' + after.room.slice(3)), 'The code starts with the room id');
    noErrors(errors, 'legacy pairing');
    log('PASS — a legacy pairing is retired until a new code is generated.');
    await ctx.close();
  }

  // ── 26. Sync stays down behind the PIN lock and starts on unlock ───────
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await ctx.addInitScript(ONBOARDED);
    await ctx.addInitScript(() => {
      localStorage.setItem('rephrame_peer_id_v1', 'rephrame-abcdef');
      window.__fakePeers = [];
      window.__dials = [];
      window.Peer = class {
        constructor(id) {
          this.id = id; this.destroyed = false; this._h = {};
          window.__fakePeers.push(this);
          setTimeout(() => (this._h.open || []).forEach(fn => fn()), 0);
        }
        on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
        connect(peerId) { window.__dials.push(peerId); return { peer: peerId, open: false, on() { return this; }, send() {}, close() {} }; }
        destroy() { this.destroyed = true; }
        reconnect() {}
      };
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });
    // Pair through the hook (the secret only ever becomes keys, kept in real
    // IndexedDB here so the reload below reads them back), enable sync, set
    // a PIN and lock.
    await page.evaluate(async () => {
      await window.__syncTestHooks.installPairing({ room: 'ABCDEF', secret: '0123456789AB', peer: 'rephrame-zzzzzz', verified: true });
      localStorage.setItem('rephrame_sync_enabled', '1');
      await setStoredPin('2468');
      sessionStorage.removeItem('reframe-unlocked');
    });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#lockPinInput', { timeout: 10000 });
    await page.waitForTimeout(400);
    const locked = await page.evaluate(() => ({ peers: window.__fakePeers.length, dials: window.__dials.length }));
    assert.equal(locked.peers, 0, 'Locked: no peer registered on the broker');
    assert.equal(locked.dials, 0, 'Locked: no auto-dial of the paired device');
    await page.locator('#lockPinInput').fill('2468');
    await page.locator('#lockForm button[type="submit"]').click();
    await page.waitForFunction(() => window.__fakePeers.length === 1 && window.__dials.length === 1, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__dials[0]), 'rephrame-zzzzzz', 'Unlock starts sync (keys read back from IndexedDB) and dials the paired device');
    // Lock now takes it down again.
    await page.locator('[data-action="open-settings"]').first().click();
    await page.locator('[data-action="lock-now"]').first().click();
    await page.waitForSelector('#lockPinInput', { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__fakePeers[0].destroyed), true, 'Lock now destroys the peer');
    noErrors(errors, 'pin gate');
    log('PASS — sync waits behind the PIN lock, starts on unlock and stops on lock.');
    await ctx.close();
  }

  // ── 27. The app refuses to render inside another site's frame ──────────
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const page = await ctx.newPage();
    await page.setContent('<!doctype html><html><body><iframe id="f" src="' + URL + '" width="400" height="800"></iframe></body></html>');
    let frame = null;
    for (let i = 0; i < 100 && !frame; i++) {
      frame = page.frames().find(f => f !== page.mainFrame() && f.url().includes('index.html')) || null;
      if (!frame) await page.waitForTimeout(50);
    }
    assert.ok(frame, 'The frame loaded');
    await frame.waitForSelector('a[target="_top"]', { timeout: 10000 });
    await page.waitForTimeout(500);
    const inFrame = await frame.evaluate(() => ({
      app: !!document.querySelector('.app'),
      view: !!document.getElementById('view'),
      booted: typeof window.__syncTestHooks !== 'undefined' || typeof window.renderSyncPanel === 'function',
      text: document.body.textContent,
      link: document.querySelector('a[target="_top"]').getAttribute('href'),
      bodies: document.querySelectorAll('body').length,
    }));
    assert.equal(inFrame.app, false, 'No app shell rendered in the frame');
    assert.equal(inFrame.view, false, 'No #view in the frame');
    assert.equal(inFrame.booted, false, 'app.js / sync.js did not boot in the frame');
    assert.equal(inFrame.bodies, 1, 'Only the notice document remains');
    assert.match(inFrame.text, /inside another website/, 'The notice explains');
    assert.equal(inFrame.link, URL, 'The escape link opens the app directly');
    log('PASS — framed loads show the escape notice instead of the app.');
    await ctx.close();
  }

  // Blocks 28–30 read app.js's reference tables and draft helpers from inside
  // page.evaluate; they aren't in eslint's shared appProvides list.
  /* global emptyEntry, seedDraftFromPrimaryDistortion, SOCRATIC_TYPES, REFRAME_METHODS,
     DISTORTIONS, DISTORTION_DEFAULTS, INTENSITY_BANDS, band, entryToMd, ACTIVITY_CATEGORIES */
  // ── 28. A tapped field clears the Android keyboard and the sticky chrome ──
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(ONBOARDED);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.evaluate(() => {
      state.view = 'capture'; state.captureStep = 2;
      state.draft = emptyEntry(); state.draft.trigger = 'Meeting ran long';
      render(); window.scrollTo(0, 0);
    });
    await page.waitForTimeout(450);
    // Park the Body field just above the sticky footer, where a user who has
    // scrolled down to it would see it.
    await page.evaluate(() => {
      const r = document.querySelector('[data-field="bodyCheck"]').getBoundingClientRect();
      const f = document.querySelector('.capture-footer').getBoundingClientRect();
      window.scrollBy(0, r.bottom - f.top + 10);
    });
    await page.locator('[data-field="bodyCheck"]').tap();
    await page.waitForTimeout(80);
    // The keyboard opens: resizes-content shrinks the layout viewport, then
    // Chrome scrolls the focused field to just above the keyboard edge,
    // knowing nothing about the chrome stacked there.
    await page.setViewportSize({ width: 390, height: 480 });
    await page.evaluate(() => document.activeElement.scrollIntoView({ block: 'nearest' }));
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const ta = document.activeElement.getBoundingClientRect();
      const footer = document.querySelector('.capture-footer').getBoundingClientRect();
      return {
        field: document.activeElement.dataset.field,
        kbOpen: document.body.classList.contains('kb-open'),
        taTop: ta.top, taBottom: ta.bottom, footerTop: footer.top,
      };
    });
    assert.equal(r.field, 'bodyCheck', 'The tapped field still has focus');
    assert.equal(r.kbOpen, true, 'A keyboard that shrinks innerHeight still switches .kb-open on');
    assert.ok(r.taTop >= 0 && r.taBottom <= r.footerTop,
      `The field sits fully above the sticky footer (field ${Math.round(r.taTop)}–${Math.round(r.taBottom)}, footer at ${Math.round(r.footerTop)})`);
    noErrors(errors, 'keyboard reveal');
    log('PASS — a tapped field is lifted clear of the keyboard and the sticky footer.');
    await ctx.close();
  }

  // ── 29. An expander near the bottom opens into view ────────────────────
  {
    const { ctx, page, errors } = await openApp();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      state.view = 'capture'; state.captureStep = 2;
      state.draft = emptyEntry(); state.draft.trigger = 'Meeting ran long';
      render(); window.scrollTo(0, 0);
    });
    await page.waitForTimeout(450);
    const summary = page.locator('details.ref-inline summary', { hasText: 'Body region reference' });
    // Scroll so the summary sits just above the footer: opening it there is
    // what used to unfold the table straight under the Continue bar.
    await page.evaluate(() => {
      const s = [...document.querySelectorAll('details.ref-inline summary')].find(x => /Body region/.test(x.textContent));
      const f = document.querySelector('.capture-footer').getBoundingClientRect();
      window.scrollBy(0, s.getBoundingClientRect().bottom - f.top + 4);
    });
    await summary.click();
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const s = [...document.querySelectorAll('details.ref-inline summary')].find(x => /Body region/.test(x.textContent));
      const d = s.parentElement.getBoundingClientRect();
      const f = document.querySelector('.capture-footer').getBoundingClientRect();
      return { open: s.parentElement.open, bottom: d.bottom, top: d.top, footerTop: f.top };
    });
    assert.equal(r.open, true, 'The expander opened');
    assert.ok(r.top >= 0 && r.bottom <= r.footerTop,
      `The opened reference sits above the sticky footer (${Math.round(r.top)}–${Math.round(r.bottom)}, footer at ${Math.round(r.footerTop)})`);
    noErrors(errors, 'expander reveal');
    log('PASS — an expander opened near the footer unfolds into view.');
    await ctx.close();
  }

  // ── 30. Distortion pairings fit, legacy names migrate, felt-sense cues ──
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'legacy-pie', kind: 'thought-record', createdAt: '2026-05-01T10:00:00.000Z', trigger: 'x', socraticType: 'Zoom out (pie chart)' },
        { id: 'legacy-pb',  kind: 'thought-record', createdAt: '2026-05-02T10:00:00.000Z', trigger: 'y', socraticType: 'Perspective broadening' },
        { id: 'legacy-ht',  kind: 'thought-record', createdAt: '2026-05-03T10:00:00.000Z', trigger: 'z', socraticType: 'Historical test', distortions: ['Minimization'] },
      ]));
    });
    const r = await page.evaluate(() => {
      const types = new Set(SOCRATIC_TYPES.map(t => t.type));
      const methods = new Set(REFRAME_METHODS.map(m => m.method));
      const unmapped = DISTORTIONS.map(d => d.name).filter(n => !DISTORTION_DEFAULTS[n]);
      const dangling = Object.entries(DISTORTION_DEFAULTS)
        .filter(([, v]) => !types.has(v.socratic) || !methods.has(v.reframe)).map(([k]) => k);
      const seeded = {};
      for (const name of ['All-or-Nothing Thinking', 'Mental Filter', 'Magnification and Minimization', 'Personalization', 'Labeling', 'Should Statements', 'Blame']) {
        const d = emptyEntry();
        d.thoughts = [{ id: 't', text: 'I ruined the whole thing', isHot: true }];
        d.distortions = [name];
        seedDraftFromPrimaryDistortion(d);
        seeded[name] = { type: d.socraticType, q: d.socraticQuestion, method: d.reframeMethod, newThought: d.newThought };
      }
      return {
        unmapped, dangling, seeded,
        legacy: state.entries.map(e => [e.id, e.socraticType]),
        legacyDistortions: state.entries.find(e => e.id === 'legacy-ht').distortions,
        cues: INTENSITY_BANDS.map(b => b.signals).join(' | '),
        zeroBand: band(0).label,
        severeFrom: INTENSITY_BANDS.find(b => b.label === 'Severe') && band(80).label,
      };
    });
    assert.deepEqual(r.unmapped, [], 'Every distortion has pre-set defaults');
    assert.deepEqual(r.dangling, [], 'Every default names a real question type and reframe method');
    const aon = r.seeded['All-or-Nothing Thinking'];
    assert.equal(aon.type, 'Shades of gray', 'All-or-Nothing is challenged on a continuum');
    assert.doesNotMatch(aon.q, /pie chart|slice/i, 'All-or-Nothing is not handed the responsibility pie');
    assert.match(aon.q, /0 to 100/, 'All-or-Nothing question asks where it sits between the extremes');
    for (const name of ['Mental Filter', 'Magnification and Minimization']) {
      assert.doesNotMatch(r.seeded[name].q, /pie chart|slice/i, `${name} is not handed the responsibility pie`);
    }
    assert.equal(r.seeded['Personalization'].type, 'Responsibility pie', 'Self-blame gets the responsibility pie');
    assert.equal(r.seeded['Labeling'].method, 'Behavior, not identity', 'A label is reframed as a behavior');
    assert.equal(r.seeded['Should Statements'].method, 'Flexible preference', 'A should is reframed as a preference');
    assert.equal(r.seeded['Blame'].type, 'Responsibility pie', 'Blame gets the responsibility pie, self included');
    for (const [name, v] of Object.entries(r.seeded)) {
      assert.equal(v.newThought, '', `${name}: picking a distortion never writes a stock reframe into the entry`);
    }
    assert.deepEqual(Object.fromEntries(r.legacy),
      { 'legacy-pie': 'Responsibility pie', 'legacy-pb': 'Full picture', 'legacy-ht': 'Track record' },
      'Stored legacy question-type names migrate to the current ones');
    assert.deepEqual(r.legacyDistortions, ['Magnification and Minimization'],
      'A stored "Minimization" tag migrates to Burns\'s two-way item');
    assert.equal(r.zeroBand, 'None', 'A rating of 0 reads as None, not Mild');
    assert.equal(r.severeFrom, 'Severe', 'The Severe band starts at 80, where the grounding note appears');
    assert.doesNotMatch(r.cues, /voice|vocal|tone|yelling|crying|speech/i,
      'Intensity cues describe how it feels, not how it sounds: ' + r.cues);
    noErrors(errors, 'distortion pairings');
    log('PASS — distortion pairings fit, legacy names migrate, intensity cues are felt-sense.');
    await ctx.close();
  }

  // ── 31. Crisis resources name the right service for each country ──────
  {
    const { ctx, page, errors } = await openApp();
    await page.locator('[data-nav="reference"]').click();
    await page.waitForSelector('.ref-section--safety', { timeout: 5000 });
    const ref = await page.locator('.ref-section--safety').innerText();
    await page.evaluate(() => setState({ modal: 'safety' }));
    await page.waitForSelector('.safety-list', { timeout: 5000 });
    const modal = await page.locator('.safety-list').innerText();
    for (const [where, text] of [['Reference', ref], ['Safety dialog', modal]]) {
      assert.doesNotMatch(text, /US \/ Canada/, `${where}: the US Lifeline and Canada's 9-8-8 are listed separately`);
      assert.match(text, /9-8-8: Suicide Crisis Helpline/, `${where}: Canada's own service is named`);
      assert.match(text, /SHOUT[\s\S]{0,8}85258/, `${where}: the UK text line uses Shout's keyword`);
      assert.match(text, /CONNECT[\s\S]{0,8}686868/, `${where}: Kids Help Phone uses its own keyword`);
      assert.doesNotMatch(text, /iasp\.info|988lifeline\.org\/chat/, `${where}: no dead or redirected links`);
    }
    noErrors(errors, 'crisis resources');
    log('PASS — crisis resources name the right service, keyword and link per country.');
    await ctx.close();
  }

  // ── 32. Accuracy after evidence, new feelings, prediction, worries ─────
  {
    const { ctx, page, errors } = await openApp(() => {
      localStorage.setItem('reframe-journal-v1', JSON.stringify([
        { id: 'w-loop', kind: 'worry', createdAt: '2026-09-01T10:00:00.000Z', worryText: 'What if I lose the job?', scheduledFor: '2026-09-01T18:00:00.000Z' },
        { id: 'tr-old', kind: 'thought-record', createdAt: '2026-08-01T10:00:00.000Z', trigger: 'x',
          moods: [{ id: 'm1', family: 'Jealousy', variant: 'envious', intensity: 50 }] },
      ]));
    });
    const r = await page.evaluate(() => {
      state.view = 'capture'; state.captureStep = 4;
      state.draft = emptyEntry(); state.draft.trigger = 'Snapped at my partner';
      state.draft.thoughts = [{ id: 't', text: "I'm a terrible partner", isHot: true, beliefBefore: 80 }];
      render();
      const step4 = document.querySelector('.capture-screen').innerHTML;
      const againstIdx = step4.indexOf('data-field="evidenceAgainst"');
      const tileIdx = step4.indexOf('Having weighed it, the facts back this thought up');
      state.captureStep = 5; render();
      const hasNewFeelings = !!document.querySelector('[data-field="newFeelings"]');
      state.captureStep = 6; render();
      const hasPrediction = !!document.querySelector('[data-field="pivotPrediction"]');
      state.draft.newFeelings = 'relief';
      state.draft.pivotPrediction = 'They will be cold all evening.';
      const md = entryToMd(normalizeEntry(state.draft), 0);
      return {
        againstIdx, tileIdx, hasNewFeelings, hasPrediction, md,
        oldFamily: state.entries.find(e => e.id === 'tr-old').moods[0].family,
        cats: ACTIVITY_CATEGORIES.map(c => c.value),
      };
    });
    assert.ok(r.againstIdx > 0 && r.tileIdx > r.againstIdx, 'Step 4 offers the accuracy choice after the evidence lists');
    assert.equal(r.hasNewFeelings, true, 'The reframe re-rate has room for feelings that showed up');
    assert.equal(r.hasPrediction, true, 'The pivot step asks what you expect to happen');
    assert.match(r.md, /New feelings:\*\* relief/, 'New feelings reach the Markdown export');
    assert.match(r.md, /Expected:\*\* They will be cold/, 'The prediction reaches the Markdown export');
    assert.equal(r.oldFamily, 'Jealousy & envy', 'A stored "Jealousy" mood migrates to "Jealousy & envy"');
    assert.ok(r.cats.includes('work') && r.cats.includes('meaning'), 'Activity types include work/study and meaning');

    // Postpone the same worry twice from its card: the second time it says so.
    await page.evaluate(() => { state.view = 'journal'; state.expandedIds.add('w-loop'); render(); });
    for (let i = 0; i < 2; i++) {
      await page.locator('#entry-w-loop [data-action="worry-postpone"]').click();
      await page.waitForTimeout(150);
      await page.evaluate(() => { state.expandedIds.add('w-loop'); render(); });
    }
    const w = await page.evaluate(() => ({
      count: state.entries.find(e => e.id === 'w-loop').postponeCount,
      text: document.getElementById('entry-w-loop').innerText,
    }));
    assert.equal(w.count, 2, 'Each postponement is counted');
    assert.match(w.text, /postponed 2 times/, 'A twice-postponed worry suggests working it through');
    noErrors(errors, 'follow-through pieces');
    log('PASS — accuracy after evidence, new feelings, prediction, postpone count, family and category updates.');
    await ctx.close();
  }

  // Blocks 33+ run against the bundled sample journal: seven entries across
  // several days, enough for the list to scroll and for Patterns to chart.
  // Page-side names used inside page.evaluate below:
  /* global makeSampleEntries, DOMMatrix */
  const loadSamples = (page) => page.evaluate(() => {
    state.entries = makeSampleEntries()
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    state.entries.forEach(e => { e.isFavorite = false; });
    persist();
    render();
  });

  // ── 33. A collapsed entry card shows only its head ─────────────────────
  {
    const { ctx, page, errors } = await openApp();
    await loadSamples(page);
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('.entry-card')].map(c => c.querySelector('.entry-body-wrap').getBoundingClientRect().height));
    assert.ok(heights.length > 3, 'Sample journal rendered (precondition)');
    assert.ok(heights.every(h => h === 0), 'Every collapsed card body is 0px tall, not a strip plus a dead action bar: ' + JSON.stringify(heights));
    const id = await page.evaluate(() => document.querySelector('.entry-card').id);
    await page.locator('#' + id + ' .entry-card-head').click();
    await page.waitForTimeout(500);
    const open = await page.evaluate(id => document.querySelector('#' + id + ' .entry-body-wrap').getBoundingClientRect().height, id);
    assert.ok(open > 50, 'An expanded card shows its body (' + open + 'px)');
    await page.locator('#' + id + ' .entry-card-head').click();
    await page.waitForTimeout(500);
    const shut = await page.evaluate(id => document.querySelector('#' + id + ' .entry-body-wrap').getBoundingClientRect().height, id);
    assert.equal(shut, 0, 'Collapsing it again returns the body to 0px');
    noErrors(errors, 'collapsed card');
    log('PASS — collapsed cards show only their head.');
    await ctx.close();
  }

  // ── 34. One dialog handing over to another keeps the backdrop ──────────
  {
    const { ctx, page, errors } = await openApp();
    await page.locator('[data-action="open-settings"]').first().click();
    await page.waitForSelector('.modal-overlay [data-action="open-set-pin"]', { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelector('.modal-overlay').dataset.tag = 'ov-1'; });
    await page.locator('[data-action="open-set-pin"]').click();
    await page.waitForSelector('#pinNew', { timeout: 5000 });
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => {
      const o = document.querySelector('.modal-overlay');
      return {
        tag: o.dataset.tag,
        overlayAnimations: o.getAnimations().length,
        opacity: +getComputedStyle(o).opacity,
        focusInside: document.querySelector('.modal').contains(document.activeElement),
      };
    });
    assert.equal(r.tag, 'ov-1', 'The overlay survives the switch to a different dialog');
    assert.equal(r.overlayAnimations, 0, 'Its fade-in does not restart (the page behind used to blink through)');
    assert.equal(r.opacity, 1, 'The backdrop stays fully opaque');
    assert.equal(r.focusInside, true, 'Focus moves into the new dialog');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.modal-overlay'), null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.action), 'open-settings',
      'Closing returns focus to what opened the first dialog');
    noErrors(errors, 'modal swap');
    log('PASS — switching dialogs keeps the backdrop and moves focus in.');
    await ctx.close();
  }

  // ── 35. The Undo countdown bar actually counts down ────────────────────
  {
    const { ctx, page, errors } = await openApp();
    await page.evaluate(() => toast('Entry deleted', { ms: 6000, countdown: true, action: { label: 'Undo', onClick() {} } }));
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const bar = document.querySelector('.toast-countdown');
      const t = bar.closest('.toast').getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return { scale: new DOMMatrix(getComputedStyle(bar).transform).a, inset: b.left - t.left };
    });
    // It used to be at scaleX(0) from the first frame: the transition's end
    // state was set before the bar had ever been styled.
    assert.ok(r.scale > 0.55 && r.scale < 0.95, 'About a quarter of the way through a 6s toast, the bar is about three quarters full (' + r.scale.toFixed(2) + ')');
    assert.ok(r.inset >= 20, 'The bar starts inside the pill\'s rounded end (' + r.inset + 'px in)');
    noErrors(errors, 'toast countdown');
    log('PASS — the Undo countdown bar runs, inside the pill.');
    await ctx.close();
  }

  // ── 36. Toasts above one that leaves glide down instead of dropping ────
  {
    const { ctx, page, errors } = await openApp();
    const r = await page.evaluate(async () => {
      toast('Older', { ms: 60000 });
      await new Promise(res => setTimeout(res, 500));
      const older = document.querySelector('.toast');
      const alone = older.getBoundingClientRect().top;
      const newer = toast('Newer', { ms: 60000 });
      await new Promise(res => setTimeout(res, 600));
      const stacked = older.getBoundingClientRect().top;
      newer.dismiss();
      const tops = [];
      const t0 = performance.now();
      await new Promise(res => {
        const tick = () => { tops.push(older.getBoundingClientRect().top); if (performance.now() - t0 < 600) requestAnimationFrame(tick); else res(); };
        requestAnimationFrame(tick);
      });
      return { alone, stacked, tops, left: document.querySelectorAll('.toast').length };
    });
    const span = r.alone - r.stacked;
    assert.ok(span > 20, 'The newer toast pushed the older one up (precondition)');
    const between = r.tops.filter(t => t > r.stacked + 4 && t < r.alone - 4);
    assert.ok(between.length >= 2, 'The older toast passes through in-between positions as the newer one leaves: ' + JSON.stringify(r.tops.map(Math.round)));
    assert.ok(Math.abs(r.tops[r.tops.length - 1] - r.alone) <= 1, 'It settles where it sat alone');
    assert.equal(r.left, 1, 'The dismissed toast is removed');
    noErrors(errors, 'toast stack');
    log('PASS — the toast stack glides when one leaves.');
    await ctx.close();
  }

  // ── 37. Pinning the first coping card doesn't move the card you tapped ─
  {
    const { ctx, page, errors } = await openApp();
    await loadSamples(page);
    const r = await page.evaluate(async () => {
      const card = document.querySelectorAll('.entry-card')[2];
      card.scrollIntoView({ block: 'center' });
      await new Promise(res => setTimeout(res, 100));
      const id = card.id;
      const before = card.getBoundingClientRect().top;
      card.querySelector('[data-action="toggle-favorite"]').click();
      const pinned = document.getElementById(id).getBoundingClientRect().top;
      await new Promise(res => setTimeout(res, 500));
      const strip = !!document.querySelector('.coping-strip');
      document.getElementById(id).querySelector('[data-action="toggle-favorite"]').click();
      const unpinned = document.getElementById(id).getBoundingClientRect().top;
      return { before, pinned, unpinned, strip, stripAfter: !!document.querySelector('.coping-strip') };
    });
    assert.equal(r.strip, true, 'The first pin adds the coping strip above the list (precondition)');
    assert.ok(Math.abs(r.pinned - r.before) <= 1, `The starred card stays put as the strip appears (${Math.round(r.before)} → ${Math.round(r.pinned)})`);
    assert.equal(r.stripAfter, false, 'Unpinning the last card removes the strip (precondition)');
    assert.ok(Math.abs(r.unpinned - r.before) <= 1, `…and stays put as it goes (${Math.round(r.before)} → ${Math.round(r.unpinned)})`);
    noErrors(errors, 'pin anchoring');
    log('PASS — pinning / unpinning holds the tapped card still.');
    await ctx.close();
  }

  // ── 38. A new view starts at its top; re-tapping the tab scrolls up ────
  {
    const { ctx, page, errors } = await openApp();
    await loadSamples(page);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(100);
    const jumped = await page.evaluate(() => {
      document.querySelector('[data-nav="patterns"]').click();
      return window.scrollY;
    });
    // It used to smooth-scroll from 1200 up through the new view while that
    // view was still fading in.
    assert.equal(jumped, 0, 'Switching view lands at the top in the same frame');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(100);
    const r = await page.evaluate(async () => {
      const start = window.scrollY;
      document.querySelector('[data-nav="patterns"]').click();
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      return { start, soon: window.scrollY };
    });
    assert.ok(r.start > 300, 'Patterns scrolls (precondition)');
    assert.ok(r.soon > 0, 'Re-tapping the current tab scrolls up smoothly rather than jumping');
    await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 3000 });
    noErrors(errors, 'view scroll');
    log('PASS — new views start at the top; re-tapping the tab scrolls smoothly.');
    await ctx.close();
  }

  // ── 39. Patterns charts draw in on arrival, not on a background render ─
  {
    const { ctx, page, errors } = await openApp();
    await loadSamples(page);
    await page.locator('[data-nav="patterns"]').click();
    await page.waitForTimeout(60);
    const entering = await page.evaluate(() => getComputedStyle(document.querySelector('.bar-fill')).animationName);
    assert.equal(entering, 'barGrow', 'Bars grow in when Patterns opens');
    await page.waitForTimeout(1300);
    await page.evaluate(() => render());
    const again = await page.evaluate(() => getComputedStyle(document.querySelector('.bar-fill')).animationName);
    assert.equal(again, 'none', 'A background re-render (sync merge, another tab) does not replay them');
    noErrors(errors, 'patterns draw-in');
    log('PASS — Patterns charts draw in once per visit.');
    await ctx.close();
  }

  // ── 40. Lock screen shakes once per failed try and fades off on unlock ─
  {
    const { ctx, page, errors } = await openApp();
    await page.evaluate(async () => { await setStoredPin('2468'); sessionStorage.removeItem('reframe-unlocked'); });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#lockPinInput', { timeout: 10000 });
    await page.locator('#lockPinInput').fill('1111');
    await page.locator('#lockForm button[type="submit"]').click();
    await page.waitForSelector('.lock-error', { timeout: 5000 });
    assert.match(await page.locator('#lockPinInput').getAttribute('class'), /is-shaking/, 'A wrong PIN shakes the field');
    await page.locator('[data-action="lock-forgot"]').click();
    assert.doesNotMatch(await page.locator('#lockPinInput').getAttribute('class'), /is-shaking/,
      'Opening "Forgot PIN?" re-renders the lock screen without shaking again');
    await page.locator('#lockPinInput').fill('2468');
    await page.locator('#lockForm button[type="submit"]').click();
    await page.waitForFunction(() => !document.body.classList.contains('is-locked'), null, { timeout: 5000 });
    assert.equal(await page.locator('#lockPinInput').count(), 0, 'The PIN field is gone the moment the journal unlocks');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.lock-screen').count(), 0, 'The fading lock screen is removed afterwards');
    noErrors(errors, 'lock screen motion');
    log('PASS — the lock screen shakes once per failure and fades off on unlock.');
    await ctx.close();
  }

  // ── 41. Deleting an entry closes its space instead of snapping ─────────
  {
    const { ctx, page, errors } = await openApp();
    await loadSamples(page);
    const r = await page.evaluate(async () => {
      const cards = [...document.querySelectorAll('.entry-card')];
      const victim = cards[3];
      const nextId = cards[4].id;
      victim.querySelector('.entry-card-head').click();
      await new Promise(res => setTimeout(res, 400));
      victim.querySelector('[data-action="delete"]').click();
      await new Promise(res => setTimeout(res, 400));
      const topBefore = document.getElementById(nextId).getBoundingClientRect().top;
      document.querySelector('[data-action="confirm-delete"]').click();
      const ghost = document.querySelectorAll('.gap-closer').length;
      const topNow = document.getElementById(nextId).getBoundingClientRect().top;
      await new Promise(res => setTimeout(res, 600));
      return {
        ghost, topBefore, topNow,
        topAfter: document.getElementById(nextId).getBoundingClientRect().top,
        ghostsLeft: document.querySelectorAll('.gap-closer').length,
        gone: !document.getElementById(victim.id),
      };
    });
    assert.equal(r.gone, true, 'The entry is deleted at once (precondition)');
    assert.equal(r.ghost, 1, 'Its space is held by a closing placeholder');
    assert.ok(Math.abs(r.topNow - r.topBefore) <= 1, 'The card below has not jumped yet on the frame of the delete');
    assert.ok(r.topAfter < r.topBefore - 50, 'It then moves up into the space');
    assert.equal(r.ghostsLeft, 0, 'The placeholder removes itself');
    noErrors(errors, 'delete gap');
    log('PASS — a deleted entry\'s space closes smoothly.');
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
