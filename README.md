# Reframe — a private CBT journal (PWA)

A single-page, offline-first cognitive behavioral therapy journal you can install
to your home screen and run as a local, private app. No account, no server, no
analytics — everything lives in your browser's `localStorage`. You can import
and export your entries as JSON for backup.

The CBT workflow: capture a situation and an automatic thought, rate how
strongly you believe it, label the distortions you notice, gather evidence
for and against, generate a balanced reframe, then re-rate — the shift in
emotion intensity and belief is the work showing up. End on one small
behavioral pivot. The "Patterns" tab surfaces recurring distortions, the
average intensity drop across your entries, and a 30-day activity heatmap.
The "Reference" tab is an in-app primer plus a crisis-resources block.

When a full thought record is too much in the moment, the **⚡ icon in the
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
★ Coping / ⚡ Unfinished / This week / Pivoted / Pivot due. Stacks with
the per-distortion chips below the search. Reset everything via the
"Reset filters" button in the empty results state.

**Settings.** The gear icon in the top-right opens a settings modal:

- **Theme** — Auto (follow OS) / Light / Dark.
- **Gentle nudge** — Off / Daily / Every 3 days / Weekly. Shows a
  soft banner the next time you open the app if your last entry is
  older than the chosen interval. No notifications go out. "Not
  today" snoozes the banner for 18 hours.

**Print / Save as PDF.** The Export modal has a "Print / Save as PDF"
option that expands every entry, opens your browser's print dialog,
and switches to a printer-friendly layout. Pick "Save as PDF" in the
dialog to keep an offline archival copy.

## Install

### Desktop (Chrome, Edge, Brave, Arc…)

1. Open `index.html` over HTTP/HTTPS — e.g. `python3 -m http.server 8000` and
   visit `http://localhost:8000/`.
2. The "＋ Install" pill in the top-right will appear once the browser
   confirms the manifest + service worker are healthy. Click it.
3. Reframe launches as a standalone window. It works offline from then on.

### iPhone / iPad (Safari)

1. Open the site in Safari (the PWA install path on iOS only works through
   WebKit/Safari).
2. Tap the Share button → **Add to Home Screen** → Add.
3. Launching from the home screen opens Reframe fullscreen with no browser
   chrome. Data is sandboxed to that installed app.

### Android (Chrome)

1. Open the site in Chrome over HTTPS or localhost.
2. Either tap the in-app "＋ Install app" pill or open Chrome's menu (⋮) →
   **Install app** / **Add to Home screen**.

## Run it locally (fully private)

Reframe is a static site — `index.html`, `manifest.json`, `sw.js`, and a few
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

## Safety

Reframe is a journaling tool, not a substitute for therapy or crisis care. If
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
