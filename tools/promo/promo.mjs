#!/usr/bin/env node
/**
 * Rephrame's promo film: the desktop app in a browser window and the phone
 * app beside it, running one walkthrough in lockstep, at 1920x1080, 40.2
 * seconds, with captions in a band beneath them.
 *
 *   node tools/promo/promo.mjs --audio narration.mov   # tools/promo/rephrame-wide-1920x1080.mp4
 *   node tools/promo/promo.mjs --fps 8                 # a rough, silent preview
 *   node tools/promo/promo.mjs --from 10 --to 22       # one stretch of the walkthrough
 *
 * The beats and captions follow the phone film's narration word for word, so
 * its soundtrack lays straight under this one. The journal starts empty and
 * loads the app's own example entries; the four ways to capture; one thought
 * record through its steps (what happened, what you told yourself, the
 * pattern, a fairer version, one small step); saved; then settings, where
 * sync pairs devices with a code; and Patterns, in the dark theme.
 *
 * Sync's signalling server is out of reach in an offline recording, so PeerJS
 * is replaced by a stand-in that connects to nothing and then waits, which is
 * the screen a device shows until its partner dials in.
 *
 * The recorder is film.mjs beside this file. It needs ffmpeg, and a
 * playwright whose Chromium is installed; the repository pins one for the
 * smoke tests. PROMO_PLAYWRIGHT points at another, if that one's browser is
 * not there.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cue, record } from './film.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Runs in each page before the app does. No entries: the film loads the
 * app's own examples from the empty journal. Onboarding is marked done so the
 * welcome modal stays away, the theme starts light, and the nudge is off.
 */
function seed() {
  localStorage.setItem('reframe-onboarded-v1', '1');
  localStorage.setItem('reframe-settings-v1', JSON.stringify({
    theme: 'light', reminderInterval: 'off', nudgeSnoozedUntil: 0, worryWindowTime: '18:00',
  }));
  localStorage.removeItem('reframe-journal-draft-v1');
}

/** Opens, then waits: what a device shows before its partner connects. */
const PEER = `window.Peer = class Peer {
  constructor(id) { this.id = id; this.handlers = {}; this.open = false;
    setTimeout(() => { this.open = true; this.emit('open', id); }, 400); }
  on(e, f) { (this.handlers[e] ||= []).push(f); return this; }
  off() { return this; }
  emit(e, ...a) { (this.handlers[e] || []).forEach((f) => f(...a)); }
  connect() { return { on() { return this; }, close() {}, send() {} }; }
  disconnect() {} reconnect() {} destroy() {}
};`;

/** The desktop glides onto the target and clicks it on the beat's last frame; the phone taps it then. */
const press = (target) => ({
  desktop: async (c) => {
    await c.aim(target);
    await c.click(null, { at: c.n - 1 });
  },
  phone: (c) => c.click(target, { at: c.n - 1 }),
});

/**
 * Eases the target's horizontal scroller so the target sits inside it: the
 * capture modes run off the phone's right edge.
 */
const sideways = (target) => async (c) => {
  if (c.k === 0) {
    c.page.__side = await c.page.locator(target).first().evaluate((el) => {
      let sc = el.parentElement;
      while (sc && sc.scrollWidth <= sc.clientWidth) sc = sc.parentElement;
      if (!sc) return null;
      const r = el.getBoundingClientRect();
      const s = sc.getBoundingClientRect();
      const to = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + r.left - s.left - (s.width - r.width) / 2));
      sc.dataset.promoSideways = '1';
      return { from: sc.scrollLeft, to };
    });
  }
  const plan = c.page.__side;
  if (!plan) return;
  const t = Math.min(1, c.p / 0.85);
  const x = plan.from + (plan.to - plan.from) * (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  await c.page.evaluate((x) => {
    const sc = document.querySelector('[data-promo-sideways="1"]');
    if (sc) sc.scrollTo({ left: x, behavior: 'instant' });
  }, x);
};

const mode = (kind) => `[data-action="set-capture-mode"][data-kind="${kind}"]`;
const MODAL = '#modal-root .modal';

const TRIGGER = 'Sent a long, honest text three days ago. Still no reply.';
const THOUGHT = "I overshared. They're pulling away.";
const REFRAME = 'Three quiet days usually means a busy week, not me.';

// Walkthrough seconds, which are the film's: there is no title card. The
// comments quote the narration at the moment each beat lands.
const beats = cue([
  [0.0, {}],
  // "This is Rephrame, a journal for the thoughts that show up uninvited."
  [0.6, press('#view [data-action="load-sample"]')],
  [1.2, {}],
  [2.0, { both: (c) => c.bring('.entry-card') }],
  [3.0, press('.entry-card .entry-card-head')],
  [3.6, {}],
  // "Free write, plan one thing, park a worry for later, or take one thought apart."
  [4.2, press('[data-nav="capture"]')],
  [4.7, press(mode('freeform'))],
  [5.15, { both: sideways(mode('activity')) }],
  [5.55, press(mode('activity'))],
  [6.0, { both: sideways(mode('worry')) }],
  [6.7, press(mode('worry'))],
  [7.15, {}],
  [7.8, { both: sideways(mode('thought-record')) }],
  [8.3, press(mode('thought-record'))],
  [8.8, {}],
  // "Say what happened in plain words."
  [10.3, press('textarea[data-field="trigger"]')],
  [10.75, { both: (c) => c.type(TRIGGER, { share: 0.95 }) }],
  [13.4, {}],
  [13.8, press('[data-action="next-step"]')],
  [14.25, {}],
  // "Then what you told yourself about it."
  [14.45, { both: (c) => c.bring('textarea[data-action="edit-thought-text"]') }],
  [14.85, press('textarea[data-action="edit-thought-text"]')],
  [15.25, { both: (c) => c.type(THOUGHT, { share: 0.95 }) }],
  [16.6, {}],
  [16.9, press('[data-action="next-step"]')],
  [17.35, {}],
  // "Name the pattern: mind reading, personalization."
  [17.55, { both: (c) => c.bring('[data-action="toggle-distortion"][data-name="Mind Reading"]') }],
  [18.25, {}],
  [18.55, press('[data-action="toggle-distortion"][data-name="Mind Reading"]')],
  [19.1, { both: (c) => c.bring('[data-action="toggle-distortion"][data-name="Personalization"]') }],
  [19.65, press('[data-action="toggle-distortion"][data-name="Personalization"]')],
  [20.2, {}],
  // "Put it on trial, write a fairer version." By the progress dots: the
  // pattern's "starters ready" toast sits over Continue for 2.4 s.
  [20.5, { both: (c) => c.scroll(null, 0) }],
  [21.0, press('[data-action="goto-step"][data-step="4"]')],
  [21.4, {}],
  [22.3, press('[data-action="goto-step"][data-step="5"]')],
  [22.75, {}],
  [22.95, { both: (c) => c.bring('textarea[data-field="newThought"]') }],
  [23.35, press('textarea[data-field="newThought"]')],
  [23.7, { both: (c) => c.type(REFRAME, { share: 0.95 }) }],
  // "Pick one small step."
  [25.1, press('[data-action="next-step"]')],
  [25.55, {}],
  [26.2, press('[data-action="next-step"]')],
  [26.6, {}],
  // "It stays on your device."
  [26.8, press('[data-action="save-entry"]')],
  [27.25, {}],
  [28.3, press('[data-action="open-settings"]')],
  [28.75, {}],
  // "Sync your other devices with a code."
  [29.4, { both: (c) => c.bring('#syncEnableBtn', { within: MODAL }) }],
  [30.2, press('#syncEnableBtn')],
  [30.65, {}],
  // "No account, no server, no tracking."
  [32.9, { both: (c) => c.bring(`${MODAL} .modal-actions [data-action="close-modal"]`, { within: MODAL }) }],
  [33.5, press(`${MODAL} .modal-actions [data-action="close-modal"]`)],
  [33.95, {}],
  // Into the dark theme the way the Dark button does it, cross-fade and all,
  // as the scene change: the ground goes to ink with it.
  [34.45, {
    both: (c) => c.once(() => c.page.evaluate(() => {
      /* eslint-disable no-undef */
      state.settings.theme = 'dark';
      saveSettings(state.settings);
      switchThemeSmoothly(() => { applyTheme(); render(); });
      /* eslint-enable no-undef */
    })),
  }],
  // "rephrame.app"
  [35.7, press('[data-nav="patterns"]')],
  [36.15, {}],
  [37.5, { both: (c) => c.scroll(null, c.desktop ? 520 : 900, { share: 0.9 }) }],
  [39.0, {}],
], 40.23);

/** One caption state: a kicker, a headline, and whatever has been added under it. */
const caption = ({ kicker, head, sub = [], chips = [], small = '', url = '' }) => `
  <div class="band"><div class="cap">
    <div class="kicker mono">${kicker}</div>
    <div class="head">${head}</div>
    ${chips.length ? `<div class="chips">${chips.map((c) => `<span>${c}</span>`).join('')}</div>` : ''}
    ${sub.map((s) => `<div class="sub">${s}</div>`).join('')}
    ${small ? `<div class="small mono">${small}</div>` : ''}
    ${url ? `<div class="url">${url}</div>` : ''}
  </div></div>`;

/**
 * A caption that grows: each state fades in over the last, which stays until
 * the new one is opaque, so the words already there never flicker. Times are
 * the moments each addition lands, then when the whole thing leaves.
 */
const grows = (states, end, look) => states.map(([at, parts], i) => {
  const first = i === 0;
  const fadeIn = first ? 0.4 : 0.3;
  const to = i + 1 < states.length ? states[i + 1][0] + 0.3 : end;
  return { from: at, to, fadeIn, fadeOut: i + 1 < states.length ? 0 : 0.4, html: caption(parts), look };
});

const INK = '#1a1715';
const PAPER = '#f5efe6';
const FONTS = "@import url('/fonts/fonts.css');";
const SANS = "'Manrope', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

// The app's paper, a little warmer at the edges, as the phone film's ground.
const LIGHT = {
  accent: '#b8552c',
  fonts: FONTS,
  sans: SANS,
  mono: MONO,
  ground: 'radial-gradient(70% 70% at 45% 40%, #f3ece2 0%, #ebe3d6 60%, #e2d8c9 100%)',
  text: { kicker: '#b8552c', head: INK, sub: '#6e6358', small: '#8a7c6c', url: '#b8552c', chip: '#b8552c' },
  chrome: {
    page: PAPER,
    edge: 'rgba(26,23,21,.12)',
    shadow: 'rgba(70,45,25,.28)',
    glow: '0 0 0 0 transparent',
    bar: 'linear-gradient(180deg, #efe8dd, #e5dccf)',
    rule: 'rgba(26,23,21,.10)',
    dots: '#d2c6b4',
    pill: '#faf6f0',
    pillEdge: 'rgba(26,23,21,.08)',
    host: '#8a7c6c',
    path: INK,
    phoneGlow: '0 0 0 0 transparent',
  },
};
// The app's ink, warmed by a copper glow, for the dark close.
const DARK = {
  ...LIGHT,
  ground: [
    'radial-gradient(58% 50% at 46% 46%, rgba(196,104,56,.16), rgba(196,104,56,0) 70%)',
    `radial-gradient(120% 90% at 50% 45%, #2a2521 0%, ${INK} 52%, #0f0d0c 100%)`,
  ].join(','),
  text: { kicker: '#e9885a', head: PAPER, sub: '#c9bdac', small: '#a89a85', url: '#e9885a', chip: '#e9885a' },
  chrome: {
    page: INK,
    edge: 'rgba(245,239,230,.10)',
    glow: '0 0 220px -40px rgba(196,104,56,.28)',
    bar: 'linear-gradient(180deg, #2f2925, #26211d)',
    rule: 'rgba(0,0,0,.55)',
    dots: '#4a4039',
    pill: '#1f1b18',
    pillEdge: 'rgba(245,239,230,.08)',
    host: PAPER,
    path: '#c9bdac',
    phoneGlow: '0 0 120px -20px rgba(196,104,56,.22)',
  },
};

const captionCss = (look) => `
  .cap { position: absolute; left: 0; top: 34px; }
  .kicker { font-size: 15px; letter-spacing: .22em; text-transform: uppercase; color: ${look.text.kicker}; }
  .head { margin-top: 10px; font-family: 'Fraunces', Georgia, serif; font-weight: 500; font-size: 50px;
    letter-spacing: -.012em; line-height: 1.05; color: ${look.text.head}; }
  .chips { display: flex; gap: 10px; margin-top: 14px; }
  .chips span { padding: 6px 16px; border-radius: 999px; font-size: 19px; color: ${look.text.chip};
    border: 1px solid ${look.text.chip}; }
  .sub { margin-top: 8px; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 28px; color: ${look.text.sub}; }
  .small { margin-top: 12px; font-size: 14px; letter-spacing: .2em; color: ${look.text.small}; }
  .url { margin-top: 10px; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 34px; color: ${look.text.url}; }`;

// Each caption carries its own look, so its colours match the ground under it.
const withCss = (list, look) => list.map((c) => ({ ...c, html: `<style>${captionCss(look)}</style>${c.html}` }));

const captions = [
  ...withCss(grows([
    [0.0, { kicker: 'A CBT journal', head: 'For the thoughts that show up uninvited.' }],
  ], 4.4), LIGHT),
  ...withCss(grows([
    [4.4, { kicker: 'Capture', head: 'Four ways to get it out of your head.' }],
    [4.95, { kicker: 'Capture', head: 'Four ways to get it out of your head.', chips: ['Free write'] }],
    [5.9, { kicker: 'Capture', head: 'Four ways to get it out of your head.', chips: ['Free write', 'Plan one thing'] }],
    [7.05, { kicker: 'Capture', head: 'Four ways to get it out of your head.', chips: ['Free write', 'Plan one thing', 'Park a worry'] }],
  ], 10.3), LIGHT),
  ...withCss(grows([
    [10.4, { kicker: 'Thought record · Step 1', head: 'Say what happened.' }],
  ], 14.2), LIGHT),
  ...withCss(grows([
    [14.3, { kicker: 'Step 2', head: 'Then what you told yourself.' }],
  ], 17.4), LIGHT),
  ...withCss(grows([
    [17.5, { kicker: 'Step 3', head: 'Name the pattern.' }],
    [19.1, { kicker: 'Step 3', head: 'Name the pattern.', chips: ['Mind Reading'] }],
    [20.2, { kicker: 'Step 3', head: 'Name the pattern.', chips: ['Mind Reading', 'Personalization'] }],
  ], 21.7), LIGHT),
  ...withCss(grows([
    [21.8, { kicker: 'Steps 4 to 7', head: 'Put it on trial.' }],
    [23.1, { kicker: 'Steps 4 to 7', head: 'Put it on trial.', sub: ["Find a thought you'd accept."] }],
    [25.4, { kicker: 'Steps 4 to 7', head: 'Put it on trial.', sub: ["Find a thought you'd accept.", 'Pick one small step.'] }],
  ], 27.0), LIGHT),
  ...withCss(grows([
    [27.1, { kicker: 'Settings · Sync', head: 'It stays on your device.' }],
    [30.3, { kicker: 'Settings · Sync', head: 'It stays on your device.', sub: ['Pair your own devices with a code.'] }],
    [32.95, { kicker: 'Settings · Sync', head: 'It stays on your device.', sub: ['Pair your own devices with a code.'], small: 'NO ACCOUNT · NO SERVER · NO TRACKING' }],
  ], 34.5), LIGHT),
  ...withCss(grows([
    [34.7, { kicker: 'Patterns', head: 'See what keeps coming back.' }],
    [36.2, { kicker: 'Patterns', head: 'See what keeps coming back.', url: 'rephrame.app' }],
  ], 40.23), DARK),
].map((c) => ({ ...c, look: LIGHT }));

await record({
  name: 'Rephrame',
  script: 'tools/promo/promo.mjs',
  out: resolve(HERE, 'rephrame-wide-1920x1080.mp4'),
  root: resolve(HERE, '../..'),
  now: '2026-10-01T10:30:00-04:00',
  timezone: 'America/New_York',
  colorScheme: 'light',
  seed,
  replace: { '/js/vendor/peerjs.min.js': { type: 'text/javascript; charset=utf-8', body: PEER } },
  async settle(page) {
    await page.waitForSelector('.app');
    await page.waitForFunction(() => !document.body.classList.contains('is-booting'));
  },
  beats,
  layout: { scale: 0.8, top: 50 },
  fade: { in: 1.0, out: 1.0 },
  look: LIGHT,
  scenes: [
    { at: 0, look: LIGHT, address: 'rephrame.app' },
    { at: 34.45, look: DARK, address: 'rephrame.app', fade: 0.6 },
  ],
  captions,
  card: null,
  outro: 0,
}, process.argv.slice(2));
