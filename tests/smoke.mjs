// End-to-end smoke walk of the thought-record flow. Drives the real app in
// headless Chromium and asserts on rendered behavior — not unit internals.
// Runs in CI (.github/workflows/smoke.yml) and locally via `npm test` after
// `npm run serve` in another shell.
//
// Env:
//   SMOKE_URL  default http://localhost:8765/index.html
//   SHOTS_DIR  default ./smoke-shots  (screenshots, uploaded as CI artifact)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const URL = process.env.SMOKE_URL ?? 'http://localhost:8765/index.html';
const SHOTS = process.env.SHOTS_DIR ?? './smoke-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const log = (m) => console.log('[smoke] ' + m);
let step = 0;
const snap = async (page, name) => {
  const p = `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  return p;
};

const browser = await chromium.launch();
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();

  // A pageerror means the inline app script threw during render — that is a
  // hard failure, not a warning.
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.app', { timeout: 10000 });

  // Onboarding card shows on a fresh profile — begin a new entry.
  const begin = page.locator('[data-action="onboard-begin"]');
  if (await begin.count()) {
    await begin.click();
  }

  const stepTitle = async () => {
    const el = page.locator('.progress-title').first();
    return (await el.count()) ? (await el.innerText()).trim() : '(none)';
  };
  const nextStep = async () => {
    await page.locator('[data-action="next-step"]').click();
    await page.waitForTimeout(150);
  };

  // ── Step 1: Trigger ───────────────────────────────────────────────────
  // Step 1: trigger starter chips intentionally do not use `[data-field]`
  // — scope to textarea so locator strict mode stays unambiguous.

  await page.waitForSelector('textarea[data-field="trigger"]');

  await page.locator('textarea[data-field="trigger"]').fill('Got a one-line "we should talk" from my manager.');
  await snap(page, 'trigger');
  await nextStep();

  // ── Step 2: Initial Reaction ──────────────────────────────────────────
  assert.match(await stepTitle(), /Initial Reaction/i, 'Step 2 should be Initial Reaction');
  await page.locator('[data-action="edit-thought-text"]').first().fill("They're going to fire me — I've been slow this week.");
  await page.locator('[data-action="edit-mood-family"]').first().selectOption('Anxiety');
  await page.waitForTimeout(100);
  await page.locator('[data-action="edit-mood-variant"]').first().selectOption('dread');
  await snap(page, 'initial-reaction');
  await nextStep();

  // ── Step 3: DISTORTION (distortion-first so its picks seed forward) ───
  assert.match(await stepTitle(), /Distortion/i, 'Step 3 should be Distortion');
  assert.equal(await page.locator('.distortion-grid').count(), 1, 'Step 3 shows the distortion grid');
  assert.equal(await page.locator('[data-field="evidenceFor"]').count(), 0, 'Step 3 must NOT show the Challenge evidence field');
  await page.locator('[data-action="toggle-distortion"][data-name="Fortune Telling"]').click();
  await page.waitForTimeout(150);
  // Picking a distortion surfaces a note that names the *actual* forward
  // suggestions (not a vague "a question type and a reframe style"), so the
  // choice→suggestion link is clear before the user reaches Steps 4–5.
  assert.equal(await page.locator('.auto-suggest-note').count(), 1, 'Step 3 shows the auto-suggest note after a pick');
  {
    const note = await page.locator('.auto-suggest-note').innerText();
    assert.match(note, /Fortune Telling/i, 'auto-suggest note names the picked distortion');
    assert.match(note, /Probability testing/i, 'auto-suggest note names the suggested Socratic type');
    assert.match(note, /Realism/i, 'auto-suggest note names the suggested reframe method');
  }
  await snap(page, 'distortion');
  await nextStep();

  // ── Step 4: CHALLENGE (forward-seeded from the distortion) ────────────
  assert.match(await stepTitle(), /Challenge/i, 'Step 4 should be Challenge');
  assert.equal(await page.locator('[data-field="evidenceFor"]').count(), 1, 'Step 4 has Evidence FOR field');
  assert.equal(await page.locator('.distortion-grid').count(), 0, 'Step 4 must NOT show the distortion grid');
  // Distortion-first means picking "Fortune Telling" at Step 3 pre-seeds the
  // Socratic type forward into Challenge and pre-fills the question template —
  // no going back to a step you already passed.
  assert.equal(
    await page.locator('[data-field="socraticType"]').inputValue(),
    'Probability testing',
    'Distortion "Fortune Telling" pre-selects the "Probability testing" Socratic type',
  );
  const socQ = await page.locator('[data-field="socraticQuestion"]').inputValue();
  assert.ok(socQ.trim().length > 0, 'Socratic question pre-fills from the seeded type');
  // The pre-fill is the Fortune-Telling-*tailored* starter, not the generic
  // Probability-testing template — that is the per-distortion starter at work.
  assert.match(socQ, /most probable outcome/i, 'Socratic question uses the Fortune-Telling-tailored starter');
  // The "Suggested for X" pill makes the choice→suggestion link visible right
  // at the dropdown the suggestion drove.
  assert.match(
    await page.locator('.suggested-pill').first().innerText(),
    /Suggested for Fortune Telling/i,
    'Challenge step shows a "Suggested for Fortune Telling" pill on the Socratic type',
  );
  await page.locator('[data-field="evidenceFor"]').fill('They said "we should talk." That is what they said.');
  await page.locator('[data-field="evidenceAgainst"]').fill('No complaint named. Last 1:1 was positive. On time on every deliverable this month.');
  await snap(page, 'challenge');
  await nextStep();

  // ── Step 5: REFRAME ───────────────────────────────────────────────────
  assert.match(await stepTitle(), /Reframe/i, 'Step 5 should be Reframe');
  assert.equal(
    await page.locator('[data-field="reframeMethod"]').inputValue(),
    'Realism',
    'Picking "Fortune Telling" pre-selects the "Realism" reframe method',
  );
  assert.match(
    await page.locator('.suggested-pill').first().innerText(),
    /Suggested for Fortune Telling/i,
    'Reframe step shows a "Suggested for Fortune Telling" pill on the method',
  );
  const newT = await page.locator('[data-field="newThought"]').inputValue();
  assert.ok(newT.trim().length > 0, 'Reframe method pre-fills the new-thought textarea');
  // Tailored to Fortune Telling (prediction), not the generic Realism template.
  assert.match(newT, /can't actually predict/i, 'New thought uses the Fortune-Telling-tailored reframe starter');
  // New-thought belief slider (added in PR6) exists and is live.
  assert.equal(await page.locator('[data-field="newThoughtBelief"]').count(), 1, 'newThoughtBelief slider exists');
  await page.locator('[data-field="newThoughtBelief"]').fill('73');
  await page.waitForTimeout(150);
  assert.equal(
    (await page.locator('[data-slider-display="newThoughtBelief"]').first().innerText()).trim(),
    '73',
    'newThoughtBelief display updates on input',
  );
  // Color-graded emotion slider variant is present.
  assert.ok(
    (await page.locator('input.intensity-slider--emotion').count()) >= 1,
    'At least one color-graded emotion slider renders',
  );
  // Tailored worked-examples section renders and is keyed to the distortion
  // named in Step 3 (Fortune Telling), modelling a before→after move.
  assert.equal(await page.locator('.reframe-examples').count(), 1, 'Worked-examples section renders on Step 5');
  assert.match(
    await page.locator('.reframe-examples-eyebrow').innerText(),
    /Fortune Telling/i,
    'Examples section is tailored to the picked distortion',
  );
  assert.ok(
    (await page.locator('.reframe-example-after .reframe-example-text').count()) >= 1,
    'At least one before→after reframe example is shown',
  );
  await snap(page, 'reframe');
  await nextStep();

  // ── Step 6: PIVOT ─────────────────────────────────────────────────────
  assert.match(await stepTitle(), /Pivot/i, 'Step 6 should be Pivot');
  await page.locator('textarea[data-field="pivot"]').fill('Reply asking what works for them today — take the first slot offered.');
  await snap(page, 'pivot');
  await nextStep();

  // ── Step 7: REVIEW — assert card order ────────────────────────────────
  assert.match(await stepTitle(), /Review/i, 'Step 7 should be Review');
  const nums = (await page.locator('.review-card-num').allInnerTexts()).map((s) =>
    // Collapse badges (e.g. "Starter text") for stable assertions — wording can shift.
    s.replace(/\s+/g, ' ').replace(/\s*Starter\s*text\s*$/i, '').trim(),
  );
  log('review cards: ' + JSON.stringify(nums));
  assert.deepEqual(
    nums,
    ['1 · TRIGGER', '2 · INITIAL REACTION', '3 · DISTORTION', '4 · CHALLENGE', '5 · REFRAME · REALISM', '6 · THE PIVOT'],
    'Review lists Distortion (3) before Challenge (4)',
  );
  await snap(page, 'review');

  // ── Save + reopen: newThoughtBelief persists ──────────────────────────
  await page.locator('[data-action="save-entry"]').click();
  await page.waitForTimeout(400);
  const firstEntry = page.locator('.entry-card').first();
  assert.ok(await firstEntry.count(), 'Saved entry appears in the journal');
  await firstEntry.click();
  await page.waitForTimeout(250);
  const detail = await page.locator('.entry-card').first().innerHTML();
  const beliefMatch = detail.match(/Belief in this thought:[^0-9]*([0-9]+)%/);
  assert.ok(beliefMatch && beliefMatch[1] === '73', 'Reopened entry shows persisted "Belief in this thought: 73%"');
  await snap(page, 'entry-detail');

  // ── Reference panel: new canonical labels ─────────────────────────────
  const navRef = page.locator('[data-nav="reference"], [data-view="reference"], button:has-text("Reference")').first();
  if (await navRef.count()) await navRef.click();
  else await page.evaluate(() => window.setView && window.setView('reference'));
  await page.waitForSelector('.ref-section-title', { timeout: 5000 });
  await snap(page, 'reference');
  const refText = await page.locator('#app, body').first().innerText();
  for (const label of [
    'Mental Filter',
    'Historical test',
    'Zoom out (pie chart)',
    'Continuum thinking',
    'Coping/encouraging thought',
    'Strong',
  ]) {
    assert.ok(refText.includes(label), `Reference panel shows renamed label "${label}"`);
  }

  assert.equal(pageErrors.length, 0, 'No uncaught page errors during the walk: ' + JSON.stringify(pageErrors));

  log('PASS — all assertions held across the 7-step flow.');
} catch (err) {
  failed = true;
  console.error('[smoke] FAIL — ' + (err && err.message ? err.message : err));
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
