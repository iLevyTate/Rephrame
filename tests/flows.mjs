// Secondary end-to-end walk: the three non-thought-record capture kinds
// (free write, plan activity, park a worry), persistence across a reload,
// and a stored-XSS regression for the Patterns view. The primary 7-step
// thought-record flow lives in smoke.mjs; this file covers the rest so a
// regression in any single capture path fails CI loudly.
//
// Runs in CI (.github/workflows/smoke.yml) and locally via `npm run flows`
// after `npm run serve` in another shell.
//
// Env:
//   SMOKE_URL  default http://localhost:8765/index.html
//   SHOTS_DIR  default ./smoke-shots
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const URL = process.env.SMOKE_URL ?? 'http://localhost:8765/index.html';
const SHOTS = process.env.SHOTS_DIR ?? './smoke-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const log = (m) => console.log('[flows] ' + m);
let step = 0;
const snap = async (page, name) => {
  const p = `${SHOTS}/flow-${String(++step).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  return p;
};

const browser = await chromium.launch();
let failed = false;
try {
  // ── Free write / Activity / Worry on a clean, already-onboarded profile ──
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    // Skip the onboarding card so the nav is immediately reachable.
    await ctx.addInitScript(() => {
      try { localStorage.setItem('reframe-onboarded-v1', '1'); } catch (_) {}
    });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });

    const gotoCapture = async () => {
      await page.locator('[data-nav="capture"]').click();
      await page.waitForSelector('.capture-modes', { timeout: 5000 });
    };
    const journalCount = async () => {
      await page.locator('[data-nav="journal"]').click();
      await page.waitForTimeout(150);
      return page.locator('.entry-card').count();
    };

    // ── Free write ──────────────────────────────────────────────────────
    await gotoCapture();
    await page.locator('[data-action="set-capture-mode"][data-kind="freeform"]').click();
    await page.waitForSelector('textarea[data-field="body"]');
    await page.locator('input[data-field="trigger"]').fill('A quiet evening');
    await page.locator('textarea[data-field="body"]').fill('Wrote a few lines just to clear my head. Nothing to solve.');
    await snap(page, 'freewrite');
    const saveFree = page.locator('[data-action="save-entry"]');
    assert.equal(await saveFree.isDisabled(), false, 'Free write save enables once the body has text');
    await saveFree.click();
    await page.waitForTimeout(300);
    assert.equal(await journalCount(), 1, 'Free write entry lands in the journal');

    // ── Plan activity ───────────────────────────────────────────────────
    await gotoCapture();
    await page.locator('[data-action="set-capture-mode"][data-kind="activity"]').click();
    await page.waitForSelector('input[data-field="body"]');
    await page.locator('input[data-field="body"]').fill('Walk to the park');
    await page.locator('[data-action="set-activity-category"]').first().click();
    await page.locator('input[data-field="plannedFor"]').fill('2030-01-01T09:00');
    await page.waitForTimeout(100);
    const saveAct = page.locator('[data-action="save-entry"]');
    assert.equal(await saveAct.isDisabled(), false, 'Activity save enables once description + category + when are set');
    await snap(page, 'activity');
    await saveAct.click();
    await page.waitForTimeout(300);
    assert.equal(await journalCount(), 2, 'Activity entry lands in the journal');

    // ── Park a worry ────────────────────────────────────────────────────
    await gotoCapture();
    await page.locator('[data-action="set-capture-mode"][data-kind="worry"]').click();
    await page.waitForSelector('textarea[data-field="worryText"]');
    await page.locator('textarea[data-field="worryText"]').fill('Did I lock the back door?');
    await page.waitForTimeout(100);
    const saveWorry = page.locator('[data-action="save-entry"]');
    assert.equal(await saveWorry.isDisabled(), false, 'Worry save enables once the worry has text');
    await snap(page, 'worry');
    await saveWorry.click();
    await page.waitForTimeout(300);
    assert.equal(await journalCount(), 3, 'Worry entry lands in the journal');

    // ── Persistence across a reload ─────────────────────────────────────
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });
    assert.equal(await journalCount(), 3, 'All three entries survive a reload (localStorage persistence)');

    assert.equal(pageErrors.length, 0, 'No uncaught page errors during capture flows: ' + JSON.stringify(pageErrors));
    log('PASS — free write, activity, worry capture + reload persistence.');
    await ctx.close();
  }

  // ── Stored-XSS regression: a hostile mood "family" must not execute when ──
  //    the Patterns view renders the Emotion-families tile (app.js esc(fam)).
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const PAYLOAD = '<img src=x onerror="window.__xssFired=true">';
    await ctx.addInitScript((payload) => {
      try {
        localStorage.setItem('reframe-onboarded-v1', '1');
        localStorage.setItem('reframe-journal-v1', JSON.stringify([{
          id: 'xss-regression',
          kind: 'thought-record',
          createdAt: new Date().toISOString(),
          trigger: 'regression',
          thoughts: [{ id: 't1', text: 'a hot thought', isHot: true, belief: 50 }],
          moods: [{ id: 'm1', family: payload, variant: '', intensity: 50 }],
        }]));
      } catch (_) {}
    }, PAYLOAD);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.locator('[data-nav="patterns"]').click();
    await page.waitForSelector('.emo-grid', { timeout: 5000 });
    await page.waitForTimeout(200);
    await snap(page, 'xss-patterns');

    const fired = await page.evaluate(() => window.__xssFired === true);
    assert.equal(fired, false, 'Hostile mood family must NOT execute as HTML in the Patterns view');
    // The payload should still be present as escaped, visible text (the tile
    // name is CSS-uppercased, so compare case-insensitively).
    const tileText = (await page.locator('.emo-grid').innerText()).toLowerCase();
    assert.ok(tileText.includes('<img'), 'Payload renders as inert escaped text, not a live element');
    // And there must be no live <img> element injected into the grid.
    const liveImgs = await page.locator('.emo-grid img').count();
    assert.equal(liveImgs, 0, 'No live <img> element was injected from the hostile family string');
    assert.equal(pageErrors.length, 0, 'No uncaught page errors in the XSS regression: ' + JSON.stringify(pageErrors));
    log('PASS — stored-XSS payload in mood family is neutralized.');
    await ctx.close();
  }

  log('PASS — all flow assertions held.');
} catch (err) {
  failed = true;
  console.error('[flows] FAIL — ' + (err && err.message ? err.message : err));
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
