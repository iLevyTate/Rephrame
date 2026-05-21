<p align="center">
  <img src="icons/icon.svg" alt="Rephrame — italic r monogram with copper framing rule" width="132">
</p>

<h1 align="center">Rephrame</h1>

<p align="center">
  <strong>A private, offline-first CBT journal.</strong><br>
  <sub>No account · no server · no tracking · everything stays on your device.</sub>
</p>

<p align="center">
  <a href="https://ilevytate.github.io/pwacbt/"><img alt="Live demo" src="https://img.shields.io/badge/live-ilevytate.github.io%2Fpwacbt-b8552c?style=flat-square&labelColor=1a1715"></a>
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-1a1715?style=flat-square&labelColor=b8552c">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-1a1715?style=flat-square">
</p>

---

A single-page, offline-first cognitive behavioral therapy journal you can install
to your home screen and run as a local, private app. No account, no server, no
analytics — everything lives in your browser's `localStorage`. You can import
and export your entries as JSON for backup.

**Four ways to capture.** Pick whichever fits the moment:

- **Thought record** — the full Mind Over Mood walk: situation, multi-thought + multi-mood capture, distortion check, evidence for/against, Socratic prompt, balanced reframe, behavioral pivot, then a re-rate after both reframe and pivot. The shift in mood intensity + belief % is the work showing up.
- **Free write** — open page, no structure. For moments without a clear thought to challenge. Optional title + optional mood tag.
- **Plan activity** — behavioral activation: pick something concrete (a category + a datetime), predict pleasure + mastery on a 0–10 scale, then come back after to log actual values. The gap between predicted and actual is the lesson.
- **Park a worry** — worry postponement (Borkovec): write the worry, set urgency, schedule it for your worry-window time. A calm banner surfaces in-window with three resolutions: dissolved on its own, work it through (escalates to a thought record), or postpone again.

The "Patterns" tab surfaces recurring distortions, the average mood intensity drop across re-rated entries, the activity categories that lift the mood most, the % of worries that dissolved without action, and a 30-day activity heatmap. The "Reference" tab is an in-app primer plus a crisis-resources block.

When even a free-form entry is too much in the moment, the **⚡ icon in the
top-right** opens a 30-second quick capture (just the thought + intensity).
The entry lands in your journal flagged for finishing later.

First-time users get an onboarding card with a "load example entry" button
so you can see what a complete thought record looks like before writing
your own.

**Coping cards.** Tap the ★ on any entry to pin its reframe as a coping
card. Pinned reframes surface as a horizontal carousel at the top of the
Journal so you can re-read what's landed for you in past similar moments.
Tap a card to jump to the full entry.

**Pivot follow-up.** When you check a pivot as done, the entry expands a
"What happened?" reflection field. The dread-vs-actual gap is the part to
write down — it's what teaches you next time. Saved on blur, included in
Markdown export, searchable.

**Scope filters.** Above the search, chips let you narrow to All /
★ Coping / ⚡ Unfinished / Free writes / Activities / Worries /
This week / Pivoted / Pivot due. Each chip auto-hides when its count
is zero. Stacks with the per-distortion chips below the search.
Picking a kind-filter with zero matching entries shows a friendly
empty state with a "Start one" CTA that drops straight into Capture
with the right mode preselected.

**Settings.** The gear icon in the top-right opens a settings modal:

- **Theme** — Auto (follow OS) / Light / Dark.
- **Gentle nudge** — Off / Daily / Every 3 days / Weekly. Shows a
  soft banner the next time you open the app if your last entry is
  older than the chosen interval. No notifications go out. "Not
  today" snoozes the banner for 18 hours.
- **Worry window** — the time of day parked worries reappear for review.
  Defaults to 18:00 (6pm). The window stays open for 20 minutes. If the
  time has already passed today, parking a new worry schedules it for
  tomorrow.

**Print / Save as PDF.** The Export modal has a "Print / Save as PDF"
option that expands every entry, opens your browser's print dialog,
and switches to a printer-friendly layout. Pick "Save as PDF" in the
dialog to keep an offline archival copy.

**Copy a single entry.** Each expanded entry has a "Copy" button that
puts the entry's Markdown on your clipboard — useful for pasting one
record into a message to a clinician without exporting the whole journal.

**Undo delete.** Deleting an entry now shows an "Undo" toast for 6
seconds before it sticks. Click Undo to restore the entry to its
original position in the list.

**Privacy lock (PIN).** Optional 4–8 digit PIN gated on each new tab
session. Stored as a SHA-256 hash on the device only. The entries
themselves aren't encrypted — this is a soft lock that stops casual
snooping on a shared phone, not an attacker with developer-tools
access. There's no PIN recovery: if you forget, the only way back in
deletes everything, so export to JSON regularly.

**SW update banner.** When a new version of the app is deployed, the
service worker installs it in the background and you'll see a "new
version is ready — reload?" banner at the top. Your entries are
untouched by the reload.

## Live demo

This repo is GitHub Pages-ready. To publish your own copy:

1. Push the branch to GitHub.
2. In the repo's **Settings → Pages**, select the branch (e.g. `main`) and
   `/ (root)` as the source.
3. Wait ~30 seconds. The site is live at
   `https://<your-user>.github.io/<repo>/`.

That URL is a fully working PWA — installable, offline-capable, with
service-worker auto-updates and the in-app reload banner when a new version
ships. The `.nojekyll` file is included so GitHub Pages serves files
verbatim; all asset paths in `manifest.json`, `sw.js`, and the HTML are
relative, so the app works at any subpath.

## Install

### Desktop (Chrome, Edge, Brave, Arc…)

1. Open `index.html` over HTTP/HTTPS — e.g. `python3 -m http.server 8000` and
   visit `http://localhost:8000/`.
2. The "＋ Install" pill in the top-right will appear once the browser
   confirms the manifest + service worker are healthy. Click it.
3. Rephrame launches as a standalone window. It works offline from then on.

### iPhone / iPad (Safari)

1. Open the site in Safari (the PWA install path on iOS only works through
   WebKit/Safari).
2. Tap the Share button → **Add to Home Screen** → Add.
3. Launching from the home screen opens Rephrame fullscreen with no browser
   chrome. Data is sandboxed to that installed app.

### Android (Chrome)

1. Open the site in Chrome over HTTPS or localhost.
2. Either tap the in-app "＋ Install app" pill or open Chrome's menu (⋮) →
   **Install app** / **Add to Home screen**.

## Run it locally (fully private)

Rephrame is a static site — `index.html`, `manifest.json`, `sw.js`, and a few
icons. Any local web server works. Two one-liners:

```bash
# Python 3
python3 -m http.server 8000

# Node (one-shot, no install needed)
npx --yes http-server -p 8000 .
```

Then open `http://localhost:8000/` and install. After the first load the
service worker caches the app shell, so you can disconnect entirely.

### `file://` mode

Opening `index.html` straight from disk also works for journaling, but desktop
browsers won't allow a "real" PWA install from `file://`. iOS Safari has the
same limitation — use a local server (or host the folder somewhere private)
if you want home-screen install.

## When this tool fits

Rephrame is built for **ordinary distress** — frustration, embarrassment,
catastrophic thinking, social worries, post-event rumination, the daily
weather of being a person. It's deliberately *not* built for active trauma
processing, severe depression, psychosis, or acute suicidal ideation, where
solo cognitive work can be unhelpful or harmful. Use it alongside a
clinician for those, and use the crisis resources below first if you need
them now.

Three deliberate concessions to make the tool helpful rather than harmful:

- **"These thoughts feel accurate" tile** on Step 3 — opts out of the
  distortion frame entirely. Grief, valid anger, accurate self-criticism
  are real; the rest of the entry holds them rather than arguing.
- **Grounding gate at intensity ≥80** — surfaces a 5-4-3-2-1 prompt before
  Step 4 and inside quick-capture, because cognitive work tends to land
  better after the body has settled.
- **"Just venting" checkbox** in quick-capture — sometimes naming what's
  there *is* the intervention; no obligation to finish a 7-step entry
  later.

The re-rate is awareness, not a grade. Small shifts are still real shifts;
no shift is information too. Patterns and pivot-completion are framed the
same way — "each one is information, whether followed or not."

## Safety

Rephrame is a journaling tool, not a substitute for therapy or crisis care. If
you can't pause and write, please reach out:

- **988 Suicide & Crisis Lifeline** (US / Canada) — call or text 988
- **Crisis Text Line** — text HOME to 741741 (US) / 85258 (UK) / 686868 (Canada)
- **Samaritans** (UK / Ireland) — 116 123
- International directory: iasp.info/resources/Crisis_Centres ·
  findahelpline.com

The full list is also inside the app under **Reference → If you're in
crisis**, and reachable from a link in every empty-state and capture modal.

## Your data

- Stored in `localStorage` under the keys `reframe-journal-v1` (entries) and
  `reframe-journal-draft-v1` (in-progress capture). Never sent anywhere.
- A one-time onboarding flag lives under `reframe-onboarded-v1`.
- The Import / Export buttons in the top-right round-trip the full journal as
  JSON. Use Export to back up, and Import (Replace or Merge) to restore on a
  new device.
- Uninstalling the PWA or clearing site data deletes everything. Export first.

## Files

```
index.html                 the entire app (UI + logic, single file)
manifest.json              PWA manifest (name, icons, shortcuts)
sw.js                      service worker (offline cache)
js/pwa.js                  install prompt + SW registration + file:// fallback
icons/                     SVG app icons
```

## License

MIT — see [`LICENSE`](./LICENSE).
