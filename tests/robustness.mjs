// Robustness + data-integrity walk: the paths that protect a user's journal
// from loss or lockout but were previously uncovered by the smoke/flow walks —
//   1. Export → Import JSON round-trip (replace, merge, and dedupe-by-id).
//   2. PIN brute-force lockout (throttle after repeated wrong guesses, then a
//      correct PIN unlocks once the cool-down passes).
//   3. Multi-tab sync via the window `storage` event (a write in another tab
//      re-renders this one's journal).
//
// Runs in CI (.github/workflows/smoke.yml) and locally via `npm run robustness`
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

const log = (m) => console.log('[robustness] ' + m);
let step = 0;
const snap = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}/robust-${String(++step).padStart(2, '0')}-${name}.png`, fullPage: true });
};

const entry = (id, body) => ({
  id, kind: 'freeform', createdAt: new Date().toISOString(), body,
});

const browser = await chromium.launch();
let failed = false;
try {
  // ── 1. Export → Import round-trip ────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('reframe-onboarded-v1', '1');
        localStorage.setItem('reframe-journal-v1', JSON.stringify([
          { id: 'e1', kind: 'freeform', createdAt: '2024-02-01T10:00:00.000Z', body: 'first entry' },
          { id: 'e2', kind: 'freeform', createdAt: '2024-02-02T10:00:00.000Z', body: 'second entry' },
        ]));
      } catch (_) {}
    });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });

    const journalCount = async () => {
      await page.locator('[data-nav="journal"]').click();
      await page.waitForTimeout(150);
      return page.locator('.entry-card').count();
    };
    assert.equal(await journalCount(), 2, 'Seeded journal shows 2 entries');

    // Export the JSON backup via Settings → Export.
    await page.locator('[data-action="open-settings"]').first().click();
    await page.locator('[data-action="open-export"]').first().click();
    await page.waitForSelector('[data-action="export-json"]', { timeout: 5000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-action="export-json"]').click(),
    ]);
    const exportedJson = fs.readFileSync(await download.path(), 'utf8');
    const exported = JSON.parse(exportedJson);
    assert.equal(exported.length, 2, 'Exported JSON round-trips both entries');

    // Clear the journal, then Import (replace) the backup we just took.
    await page.evaluate(() => {
      state.entries = [];
      localStorage.setItem('reframe-journal-v1', '[]');
      render();
    });
    assert.equal(await journalCount(), 0, 'Journal cleared to 0 before import');

    const importFile = async (mode, json, expectedCount) => {
      await page.evaluate((m) => { document.getElementById('import-file').dataset.mode = m; }, mode);
      await page.locator('#import-file').setInputFiles({
        name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(json),
      });
      // FileReader → parse → persist → render is genuinely async; poll for
      // the outcome instead of sleeping a fixed 250ms (flaky on loaded CI).
      await page.waitForFunction(
        (n) => document.querySelectorAll('.entry-card').length === n,
        expectedCount,
        { timeout: 5000 }
      );
    };

    await importFile('replace', exportedJson, 2);
    assert.equal(await journalCount(), 2, 'Import (replace) restores both entries');

    // Re-import the same file in merge mode — dedupe-by-id must keep it at 2.
    // Count stays 2, so poll on the toast the merge fires instead.
    await page.evaluate((m) => { document.getElementById('import-file').dataset.mode = m; }, 'merge');
    await page.locator('#import-file').setInputFiles({
      name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(exportedJson),
    });
    await page.locator('.toast', { hasText: 'Nothing new to import' }).first().waitFor({ timeout: 5000 });
    assert.equal(await journalCount(), 2, 'Import (merge) of the same file dedupes by id (still 2)');

    // Merge a backup carrying one genuinely new entry → count grows to 3.
    const withNew = JSON.stringify([...exported, entry('e3', 'a third, new entry')]);
    await importFile('merge', withNew, 3);
    assert.equal(await journalCount(), 3, 'Import (merge) adds only the new entry (now 3)');

    await snap(page, 'import-merge');
    assert.equal(pageErrors.length, 0, 'No uncaught page errors during import/export: ' + JSON.stringify(pageErrors));
    log('PASS — export → import round-trip (replace / merge / dedupe).');
    await ctx.close();
  }

  // ── 2. PIN brute-force lockout ───────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('reframe-onboarded-v1', '1'); } catch (_) {}
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });

    // Set a PIN through the real crypto path, then re-arm the lock. setStoredPin
    // marks the current session unlocked (you shouldn't be locked out mid-use),
    // so clear that token to simulate a fresh tab before reloading — the boot
    // block then sees hasPin() && !isUnlocked() and shows the lock screen.
    await page.evaluate(async () => { await setStoredPin('1357'); });
    await page.evaluate(() => sessionStorage.removeItem('reframe-unlocked'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#lockPinInput', { timeout: 10000 });

    // verifyPin runs PBKDF2 (100k iterations) so the failure records a beat
    // after the click. The lock screen now RETAINS the typed PIN across a
    // failed attempt (so a user can fix a typo without retyping), so we can't
    // sync on an empty field anymore — instead wait until the recorded
    // failure count reaches the expected value, which directly proves the
    // async verifyPin settled and is fast (no fixed sleeps).
    const submitWrong = async (pin, expect) => {
      await page.locator('#lockPinInput').fill(pin);
      await page.locator('#lockForm button[type="submit"]').click();
      await page.waitForFunction((n) => {
        try { return (JSON.parse(localStorage.getItem('reframe-pin-lockout') || '{}').attempts || 0) >= n; }
        catch { return false; }
      }, expect, { timeout: 5000 });
    };
    const submitPin = async (pin) => {
      await page.locator('#lockPinInput').fill(pin);
      await page.locator('#lockForm button[type="submit"]').click();
    };

    // Five wrong guesses trip the throttle (lockout arms on the 5th failure).
    for (let i = 0; i < 5; i++) await submitWrong('0000', i + 1);
    await page.waitForFunction(() => {
      const e = document.querySelector('.lock-error');
      return e && /too many|wait/i.test(e.textContent || '');
    }, { timeout: 5000 });
    let err = (await page.locator('.lock-error').innerText().catch(() => '')).toLowerCase();
    assert.ok(/too many|wait/.test(err), 'After 5 wrong PINs the lockout message appears: ' + JSON.stringify(err));
    await snap(page, 'pin-lockout');

    // While locked, even the CORRECT PIN is refused (the throttle gates submit
    // before verification) — proves the cool-down isn't bypassable by guessing right.
    await submitPin('1357');
    assert.ok(await page.locator('#lockPinInput').count() === 1, 'Still locked: correct PIN is blocked during cool-down');
    err = (await page.locator('.lock-error').innerText().catch(() => '')).toLowerCase();
    assert.ok(/too many|wait/.test(err), 'Correct PIN during cool-down still shows the throttle message');

    // The 5th-failure cool-down is 2s (2^(5-4)). Wait it out, then unlock.
    await page.waitForTimeout(2300);
    await submitPin('1357');
    await page.waitForSelector('.app', { timeout: 5000 });
    assert.equal(await page.locator('#lockPinInput').count(), 0, 'Correct PIN unlocks once the cool-down passes');
    log('PASS — PIN brute-force lockout (throttle, correct-PIN blocked, then unlock).');
    await ctx.close();
  }

  // ── 3. Multi-tab storage event ───────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('reframe-onboarded-v1', '1');
        localStorage.setItem('reframe-journal-v1', JSON.stringify([
          { id: 's1', kind: 'freeform', createdAt: '2024-03-01T10:00:00.000Z', body: 'only entry' },
        ]));
      } catch (_) {}
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.app', { timeout: 10000 });
    await page.locator('[data-nav="journal"]').click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.entry-card').count(), 1, 'Starts with 1 entry');

    // Simulate another tab writing two more entries, then firing the cross-tab
    // storage event this tab listens for.
    await page.evaluate(() => {
      const more = [
        { id: 's1', kind: 'freeform', createdAt: '2024-03-01T10:00:00.000Z', body: 'only entry' },
        { id: 's2', kind: 'freeform', createdAt: '2024-03-02T10:00:00.000Z', body: 'added in another tab' },
        { id: 's3', kind: 'freeform', createdAt: '2024-03-03T10:00:00.000Z', body: 'also added elsewhere' },
      ];
      localStorage.setItem('reframe-journal-v1', JSON.stringify(more));
      window.dispatchEvent(new StorageEvent('storage', { key: 'reframe-journal-v1' }));
    });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.entry-card').count(), 3, 'Journal re-renders to 3 after the storage event');
    log('PASS — multi-tab storage event re-renders the journal.');
    await ctx.close();
  }

  log('PASS — all robustness assertions held.');
} catch (err) {
  failed = true;
  console.error('[robustness] FAIL — ' + (err && err.message ? err.message : err));
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
