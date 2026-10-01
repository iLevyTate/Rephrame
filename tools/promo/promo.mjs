#!/usr/bin/env node
/**
 * Rephrame's promo film: the desktop app in a browser window and the phone
 * app beside it, running one walkthrough in lockstep, at 1920x1080.
 *
 *   node tools/promo/promo.mjs                # tools/promo/rephrame-wide-1920x1080.mp4
 *   node tools/promo/promo.mjs --fps 10       # a rough preview, a few minutes
 *   node tools/promo/promo.mjs --from 20 --to 34
 *
 * The walkthrough: a seeded month of journal entries with two coping cards,
 * then one thought record from trigger to saved entry (the situation, the
 * automatic thought, the mood and how strong it is, the distortion, a
 * balanced reframe, and both re-ratings), then the Patterns it feeds.
 *
 * The recorder is film.mjs beside this file. It needs ffmpeg, and a
 * playwright whose Chromium is installed; the repository pins one for the
 * smoke tests. PROMO_PLAYWRIGHT points at another, if that one's browser is
 * not there.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record } from './film.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Runs in each page before the app does. Seeds a month of ordinary entries
 * relative to the page's clock, which is the film's fixed moment: six thought
 * records with re-ratings, two of them pinned as coping cards, three
 * activities, four worries and a free write. Onboarding is marked done, the
 * gentle nudge is off, and the one parked worry is not due until this
 * evening, so no banner covers the first frame.
 */
function seed() {
  const NOW = Date.now();
  const at = (daysAgo, hh, mm = 0) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };
  // "YYYY-MM-DDTHH:MM" in local time, the shape plannedFor uses.
  const local = (iso) => {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const tonight = new Date(NOW);
  tonight.setHours(18, 0, 0, 0);
  if (tonight.getTime() < NOW) tonight.setDate(tonight.getDate() + 1);

  localStorage.setItem('reframe-onboarded-v1', '1');
  localStorage.setItem('reframe-settings-v1', JSON.stringify({
    theme: 'dark', reminderInterval: 'off', nudgeSnoozedUntil: 0, worryWindowTime: '18:00',
  }));
  localStorage.removeItem('reframe-journal-draft-v1');

  const tr = (o) => ({
    kind: 'thought-record', isQuick: false, isSample: false, isFavorite: false, bodyInferred: false,
    thoughtsAccurate: false, outcomeRecorded: !!o.pivotDone, ...o,
  });
  const entries = [
    tr({
      id: 'demo-tr-dinner', createdAt: at(1, 21, 10),
      trigger: 'Maya cancelled our dinner plans an hour before, by text.',
      thoughts: [{ id: 'demo-tr-dinner-t1', text: "She'd rather be anywhere than with me.", beliefBefore: 70, beliefAfter: 30, isHot: true }],
      moods: [
        { id: 'demo-tr-dinner-m1', family: 'Sadness', variant: 'disappointed', intensity: 60, intensityAfterReframe: 35, intensityAfterPivot: 20 },
        { id: 'demo-tr-dinner-m2', family: 'Anxiety', variant: 'uneasy', intensity: 45, intensityAfterReframe: 25, intensityAfterPivot: 15 },
      ],
      bodyCheck: 'Heavy feeling in my chest.',
      distortions: ['Mind Reading', 'Personalization'],
      evidenceFor: 'It was short notice.',
      evidenceAgainst: "She said she's wiped out after a long week. She suggested another night herself.",
      socraticType: 'Alternative explanation', socraticQuestion: "What's another reason she might cancel that has nothing to do with me?",
      socraticAnswer: "She's exhausted. That's what she said, and it fits her week.",
      reframeMethod: 'Compassionate reattribution',
      newThought: 'One cancelled dinner is about her energy, not my worth. We already moved it to Sunday.',
      newThoughtBelief: 75,
      pivot: 'Reply warmly and confirm Sunday.', pivotDone: true, pivotDoneAt: at(1, 21, 30),
      pivotReflection: 'She sent a heart and a photo of her couch. Sunday is on.',
    }),
    {
      id: 'demo-worry-car', kind: 'worry', createdAt: at(1, 22, 30),
      worryText: "What if the car's warning light means a big repair bill?",
      urgency: 6, parkedAt: at(1, 22, 30), scheduledFor: tonight.toISOString(), resolution: null,
      moods: [], thoughts: [],
    },
    {
      id: 'demo-act-swim', kind: 'activity', createdAt: at(2, 7, 15),
      body: 'Swim at the community pool before work', category: 'movement',
      plannedFor: local(at(2, 7, 0)), predictedP: 3, predictedM: 5,
      completedAt: at(2, 8, 10), actualP: 7, actualM: 8,
      activityNotes: 'Cold at first. Felt clear-headed all morning.', moods: [], thoughts: [],
    },
    tr({
      id: 'demo-tr-oneonone', createdAt: at(3, 8, 50), isFavorite: true,
      trigger: 'My manager moved our 1:1 to Friday with no explanation.',
      thoughts: [{ id: 'demo-tr-oneonone-t1', text: "She's unhappy with my work and is saving it for Friday.", beliefBefore: 80, beliefAfter: 35, isHot: true }],
      moods: [{ id: 'demo-tr-oneonone-m1', family: 'Anxiety', variant: 'worried', intensity: 70, intensityAfterReframe: 35, intensityAfterPivot: 20 }],
      bodyCheck: 'Tight jaw, refreshing my calendar.',
      distortions: ['Mind Reading', 'Fortune Telling'],
      evidenceFor: 'She did not say why.',
      evidenceAgainst: 'She moves meetings every week. Last review was good. Nothing has changed since.',
      socraticType: 'Probability testing', socraticQuestion: 'Out of the last ten times a meeting moved, how many were about me?',
      socraticAnswer: 'None that I know of.',
      reframeMethod: 'Realism',
      newThought: "Calendars shuffle all the time. If there's feedback, I'll hear it Friday instead of inventing it today.",
      newThoughtBelief: 80,
      pivot: 'Ask if there is anything she wants me to prepare.', pivotDone: true, pivotDoneAt: at(3, 9, 30),
      pivotReflection: 'She had a dentist appointment. The 1:1 was routine.',
    }),
    {
      id: 'demo-free-sunday', kind: 'freeform', createdAt: at(5, 19, 30),
      trigger: 'A slow Sunday',
      body: "Changed the sheets, made soup for the week, called Dad. Didn't check work email once. Writing this down so I remember a calm day is possible.",
      moods: [], thoughts: [],
    },
    tr({
      id: 'demo-tr-birthday', createdAt: at(6, 20, 5),
      trigger: "Told my brother I can't make his birthday. He replied \"ok.\"",
      thoughts: [{ id: 'demo-tr-birthday-t1', text: "He's angry and thinks I don't care about family.", beliefBefore: 75, beliefAfter: 30, isHot: true }],
      moods: [
        { id: 'demo-tr-birthday-m1', family: 'Guilt', variant: 'guilty', intensity: 65, intensityAfterReframe: 30, intensityAfterPivot: 15 },
        { id: 'demo-tr-birthday-m2', family: 'Anxiety', variant: 'nervous', intensity: 50, intensityAfterReframe: 25, intensityAfterPivot: 15 },
      ],
      distortions: ['Mind Reading', 'Emotional Reasoning'],
      evidenceFor: 'The reply was one word.',
      evidenceAgainst: 'He sends one-word texts to everyone. I explained the clash and offered a call.',
      socraticType: 'Evidence examination', socraticQuestion: 'What does "ok." actually tell me, on its own?',
      socraticAnswer: 'Almost nothing.',
      reframeMethod: 'Balanced thought',
      newThought: 'He writes short texts to everyone. I explained, offered a call, and that is caring.',
      newThoughtBelief: 70,
      pivot: 'Call him on the morning of his birthday.', pivotDone: true, pivotDoneAt: at(4, 9, 0),
      pivotReflection: 'We talked for half an hour. He was glad I called.',
    }),
    {
      id: 'demo-act-coffee', kind: 'activity', createdAt: at(8, 18, 30),
      body: 'Coffee with Sam after work', category: 'connection',
      plannedFor: local(at(8, 17, 30)), predictedP: 5, predictedM: 3,
      completedAt: at(8, 18, 30), actualP: 8, actualM: 5,
      activityNotes: 'Almost cancelled. Laughed more than I have all month.', moods: [], thoughts: [],
    },
    {
      id: 'demo-worry-interview', kind: 'worry', createdAt: at(9, 23, 10),
      worryText: "What if the interview went badly and they don't call back?",
      urgency: 7, parkedAt: at(9, 23, 10), scheduledFor: at(8, 18, 0),
      resolution: 'dissolved', resolvedAt: at(8, 18, 10), moods: [], thoughts: [],
    },
    tr({
      id: 'demo-tr-deck', createdAt: at(11, 16, 40), isFavorite: true, linkedEntryId: 'demo-worry-deck',
      trigger: 'Spent two hours on a slide deck and still was not happy with it.',
      thoughts: [{ id: 'demo-tr-deck-t1', text: "If it isn't perfect, everyone will see I'm out of my depth.", beliefBefore: 70, beliefAfter: 25, isHot: true }],
      moods: [
        { id: 'demo-tr-deck-m1', family: 'Anxiety', variant: 'tense', intensity: 65, intensityAfterReframe: 30, intensityAfterPivot: 20 },
        { id: 'demo-tr-deck-m2', family: 'Shame', variant: 'inadequate', intensity: 50, intensityAfterReframe: 25, intensityAfterPivot: 15 },
      ],
      distortions: ['Should Statements', 'All-or-Nothing Thinking'],
      evidenceFor: 'A few slides are still plain.',
      evidenceAgainst: 'The content is right. Nobody has ever commented on slide polish.',
      socraticType: 'Shades of gray', socraticQuestion: 'What sits between perfect and out of my depth?',
      socraticAnswer: 'Clear, finished and on time.',
      reframeMethod: 'Continuum thinking',
      newThought: 'Good and finished beats perfect and late. The team needs it clear, not flawless.',
      newThoughtBelief: 80,
      pivot: 'Stop at 5pm and send it.', pivotDone: true, pivotDoneAt: at(11, 17, 0),
      pivotReflection: 'Two thumbs-up and one typo fix. That was it.',
    }),
    {
      id: 'demo-worry-deck', kind: 'worry', createdAt: at(12, 22, 0),
      worryText: "What if the deck isn't good enough for Thursday's review?",
      urgency: 6, parkedAt: at(12, 22, 0), scheduledFor: at(11, 18, 0),
      resolution: 'escalated', resolvedAt: at(11, 16, 40), linkedEntryId: 'demo-tr-deck', moods: [], thoughts: [],
    },
    {
      id: 'demo-act-dinner', kind: 'activity', createdAt: at(13, 19, 0),
      body: 'Cook a proper dinner instead of ordering in', category: 'self-care',
      plannedFor: local(at(13, 18, 30)), predictedP: 4, predictedM: 4,
      completedAt: at(13, 19, 40), actualP: 6, actualM: 7,
      activityNotes: 'Pasta with whatever was in the fridge. Proud of it.', moods: [], thoughts: [],
    },
    {
      id: 'demo-worry-lease', kind: 'worry', createdAt: at(15, 21, 30),
      worryText: "What if the landlord doesn't renew the lease?",
      urgency: 6, parkedAt: at(15, 21, 30), scheduledFor: at(14, 18, 0),
      resolution: 'dissolved', resolvedAt: at(14, 18, 5), moods: [], thoughts: [],
    },
    tr({
      id: 'demo-tr-gym', createdAt: at(18, 20, 45),
      trigger: 'Missed the gym class I booked because I worked late.',
      thoughts: [{ id: 'demo-tr-gym-t1', text: 'I never stick to anything.', beliefBefore: 65, beliefAfter: 25, isHot: true }],
      moods: [
        { id: 'demo-tr-gym-m1', family: 'Sadness', variant: 'disappointed', intensity: 70, intensityAfterReframe: 35, intensityAfterPivot: null },
        { id: 'demo-tr-gym-m2', family: 'Anger', variant: 'frustrated', intensity: 45, intensityAfterReframe: 20, intensityAfterPivot: null },
      ],
      distortions: ['Overgeneralization', 'Labeling'],
      evidenceFor: 'I missed this one.',
      evidenceAgainst: 'I went twice last week. I missed this one for a real reason.',
      socraticType: 'Track record', socraticQuestion: 'How many classes have I actually made this month?',
      socraticAnswer: 'Five out of seven.',
      reframeMethod: 'Continuum thinking',
      newThought: "Five out of seven is mostly showing up. One missed class doesn't cancel that.",
      newThoughtBelief: 70,
      pivot: "Book Thursday's class tonight.", pivotDone: false,
    }),
    tr({
      id: 'demo-tr-latefee', createdAt: at(24, 9, 20),
      trigger: 'Got a late fee on a bill I forgot to pay.',
      thoughts: [{ id: 'demo-tr-latefee-t1', text: "I'm useless with money. I can't even handle the basics.", beliefBefore: 75, beliefAfter: 30, isHot: true }],
      moods: [
        { id: 'demo-tr-latefee-m1', family: 'Shame', variant: 'embarrassed', intensity: 75, intensityAfterReframe: 35, intensityAfterPivot: 20 },
        { id: 'demo-tr-latefee-m2', family: 'Anger', variant: 'frustrated', intensity: 50, intensityAfterReframe: 25, intensityAfterPivot: 15 },
      ],
      distortions: ['Labeling', 'Magnification and Minimization'],
      evidenceFor: 'I did miss the due date.',
      evidenceAgainst: 'One missed date in a year of paying on time. The fee was small.',
      socraticType: 'Double standard', socraticQuestion: 'Would I call a friend useless for one late bill?',
      socraticAnswer: 'No. I would say it happens.',
      reframeMethod: 'Behavior, not identity',
      newThought: 'I missed one due date. Setting up autopay is handling it.',
      newThoughtBelief: 80,
      pivot: 'Set up autopay tonight.', pivotDone: true, pivotDoneAt: at(24, 20, 0),
      pivotReflection: 'Took ten minutes. Felt good to close it.',
    }),
  ];
  localStorage.setItem('reframe-journal-v1', JSON.stringify(entries));
}

/** The desktop glides onto the target and clicks it on the beat's last frame; the phone taps it then. */
const press = (target, seconds = 1.0) => ({
  seconds,
  desktop: async (c) => {
    await c.aim(target);
    await c.click(null, { at: c.n - 1 });
  },
  phone: (c) => c.click(target, { at: c.n - 1 }),
});

/**
 * Picks an option from a native select. Its popup never reaches a
 * screenshot, so the value is set directly, three quarters through the beat,
 * after the desktop has pointed at it and with a press or tap drawn there.
 */
const choose = (target, value) => async (c) => {
  if (c.desktop) await c.aim(target, { share: 0.6 });
  await c.once(async () => {
    const box = await c.page.locator(target).first().boundingBox();
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await c.pointAt(c.desktop ? { x: mid.x, y: mid.y } : mid, { down: true });
    c.markTap(mid);
    await c.page.locator(target).first().evaluate((el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }, Math.round(c.n * 0.75));
};

/**
 * Drags a range input from one value to another. The first quarter of the
 * beat brings the pointer to the thumb; the rest moves the value, eased, with
 * the pointer riding the thumb and an input event on every change.
 */
const slide = (target, from, to) => async (c) => {
  const lead = 0.25;
  const geo = await c.page.locator(target).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top + r.height / 2, w: r.width, min: Number(el.min || 0), max: Number(el.max || 100) };
  });
  const thumb = (v) => ({ x: geo.x + 10 + ((v - geo.min) / (geo.max - geo.min)) * (geo.w - 20), y: geo.y });
  if (c.p < lead) {
    if (c.desktop) await c.aim({ ...thumb(from), width: 0, height: 0 }, { share: lead * 0.9 });
    return;
  }
  const t = Math.min(1, (c.p - lead) / ((1 - lead) * 0.9));
  const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  const v = Math.round(from + (to - from) * eased);
  if (c.k === Math.ceil(lead * (c.n - 1))) c.markTap(thumb(from));
  await c.pointAt(thumb(v), { down: c.k === Math.ceil(lead * (c.n - 1)) });
  await c.page.locator(target).first().evaluate((el, { v, last }) => {
    if (Number(el.value) !== v) {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (last) el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { v, last: c.k === c.n - 1 });
};

/** Phone: eases the coping-card carousel to its second card. */
const carousel = async (c) => {
  if (c.k === 0) {
    c.page.__carousel = await c.page.locator('.coping-scroller').first().evaluate((el) => {
      const second = el.children[1];
      return second ? second.offsetLeft - el.offsetLeft - 16 : 0;
    });
  }
  const t = Math.min(1, c.p / 0.85);
  const x = c.page.__carousel * (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  await c.page.locator('.coping-scroller').first().evaluate((el, x) => el.scrollTo({ left: x, behavior: 'instant' }), x);
};

const TRIGGER = 'Typo in an email to the whole team.';
const THOUGHT = "Everyone thinks I'm sloppy now.";
const REFRAME = 'One typo is normal. Nobody judges a whole person by it.';

const beats = [
  // The journal: a month of entries, two reframes pinned as coping cards.
  { seconds: 1.8 },
  { seconds: 1.6, desktop: (c) => c.aim('.coping-scroller > :nth-child(2)'), phone: carousel },
  { seconds: 0.5 },
  // A new thought record.
  press('[data-nav="capture"]'),
  { seconds: 0.9 },
  press('textarea[data-field="trigger"]', 0.8),
  { seconds: 2.4, both: (c) => c.type(TRIGGER) },
  { seconds: 0.4 },
  press('[data-action="next-step"]'),
  { seconds: 0.8 },
  // The automatic thought, then what it felt like and how strongly.
  { seconds: 0.6, both: (c) => c.bring('textarea[data-action="edit-thought-text"]') },
  press('textarea[data-action="edit-thought-text"]', 0.8),
  { seconds: 2.0, both: (c) => c.type(THOUGHT) },
  { seconds: 0.3 },
  { seconds: 0.9, both: (c) => c.bring('[data-list="moods"] .row-card') },
  { seconds: 0.7, both: choose('select[data-action="edit-mood-family"]', 'Shame') },
  { seconds: 0.6, both: choose('select[data-action="edit-mood-variant"]', 'embarrassed') },
  { seconds: 1.4, both: slide('input[data-action="edit-mood-intensity"]', 40, 65) },
  { seconds: 0.4 },
  press('[data-action="next-step"]'),
  { seconds: 0.7 },
  // The distortion at work. Picking it pre-sets the challenge and the reframe.
  { seconds: 0.9, both: (c) => c.bring('[data-action="toggle-distortion"][data-name="Mind Reading"]') },
  press('[data-action="toggle-distortion"][data-name="Mind Reading"]', 0.9),
  { seconds: 1.6 },
  // Straight to the reframe, by the progress dots.
  { seconds: 0.7, both: (c) => c.scroll(null, 0) },
  press('[data-action="goto-step"][data-step="5"]', 0.9),
  { seconds: 0.8 },
  { seconds: 0.6, both: (c) => c.bring('textarea[data-field="newThought"]') },
  press('textarea[data-field="newThought"]', 0.8),
  { seconds: 3.0, both: (c) => c.type(REFRAME) },
  { seconds: 0.4 },
  // How much of the thought is still believed, and how strong the feeling is now.
  { seconds: 0.9, both: (c) => c.bring('.rerate-group', { block: 'start', offset: 90 }) },
  { seconds: 1.3, both: slide('input[data-action="edit-hot-belief-after"]', 70, 30) },
  { seconds: 1.3, both: slide('input[data-action="edit-mood-after-reframe"]', 65, 30) },
  { seconds: 0.6 },
  // Saved: the journal leads with it, 65 to 30.
  { seconds: 0.7, both: (c) => c.scroll(null, 0) },
  press('[data-action="goto-step"][data-step="7"]', 0.9),
  { seconds: 0.7 },
  { seconds: 0.7, both: (c) => c.bring('[data-action="save-entry"]') },
  press('[data-action="save-entry"]', 0.9),
  { seconds: 2.4 },
  // What a month of these adds up to.
  press('[data-nav="patterns"]'),
  { seconds: 1.8 },
  { seconds: 2.2, both: (c) => c.scroll(null, c.desktop ? 560 : 1000) },
  { seconds: 1.2 },
];

const INK = '#1a1715';

await record({
  name: 'Rephrame',
  script: 'tools/promo/promo.mjs',
  out: resolve(HERE, 'rephrame-wide-1920x1080.mp4'),
  root: resolve(HERE, '../..'),
  now: '2026-10-01T10:30:00-04:00',
  timezone: 'America/New_York',
  colorScheme: 'dark',
  seed,
  async settle(page) {
    await page.waitForSelector('.app');
    await page.waitForFunction(() => !document.body.classList.contains('is-booting'));
  },
  beats,
  addresses: [{ at: 0, text: 'rephrame.app' }],
  look: {
    accent: '#c46838',
    fonts: "@import url('/fonts/fonts.css');",
    sans: "'Manrope', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    // The app's ink, warmed by a copper glow where the window sits.
    ground: [
      'radial-gradient(58% 50% at 46% 46%, rgba(196,104,56,.16), rgba(196,104,56,0) 70%)',
      'radial-gradient(42% 44% at 96% 96%, rgba(233,136,90,.08), rgba(233,136,90,0) 72%)',
      `radial-gradient(120% 90% at 50% 45%, #2a2521 0%, ${INK} 52%, #0f0d0c 100%)`,
    ].join(','),
    chrome: {
      page: INK,
      edge: 'rgba(245,239,230,.10)',
      glow: '0 0 220px -40px rgba(196,104,56,.28)',
      bar: 'linear-gradient(180deg, #2f2925, #26211d)',
      rule: 'rgba(0,0,0,.55)',
      dots: '#4a4039',
      pill: '#1f1b18',
      pillEdge: 'rgba(245,239,230,.08)',
      host: '#f5efe6',
      path: '#c9bdac',
      phoneGlow: '0 0 120px -20px rgba(196,104,56,.22)',
    },
  },
  card: {
    css: `
      .wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
      .wrap img { width: 150px; height: 150px; border-radius: 34px; box-shadow: 0 30px 80px -20px rgba(196,104,56,.4); }
      h1 { margin-top: 30px; font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 132px;
        letter-spacing: -.02em; line-height: 1; color: #f5efe6; }
      .rule { width: 120px; height: 4px; border-radius: 2px; margin: 30px auto 0; background: linear-gradient(90deg, #e9885a, #8c4520); }
      .tag { margin-top: 30px; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 42px; color: #f5efe6; }
      .sub { margin-top: 16px; font-size: 26px; color: #c9bdac; letter-spacing: .01em; }
      .url { margin-top: 42px; padding: 16px 38px; border-radius: 999px; font-size: 28px; color: #e9885a;
        background: rgba(42,37,33,.85); border: 1px solid rgba(245,239,230,.10); letter-spacing: .02em; }`,
    html: `
      <div class="ground"></div>
      <div class="wrap">
        <img src="/icons/icon.svg" alt="">
        <h1>Rephrame</h1>
        <div class="rule"></div>
        <p class="tag">A private, offline-first CBT journal.</p>
        <p class="sub">No account, no server, no tracking. Everything stays on your device.</p>
        <div class="url mono">rephrame.app</div>
      </div>`,
  },
}, process.argv.slice(2));
