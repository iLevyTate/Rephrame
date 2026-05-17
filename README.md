# Reframe — a private CBT journal (PWA)

A single-page, offline-first cognitive behavioral therapy journal you can install
to your home screen and run as a local, private app. No account, no server, no
analytics — everything lives in your browser's `localStorage`. You can import
and export your entries as JSON for backup.

The CBT workflow: capture a situation and an automatic thought, label the
distortions you notice, gather evidence for and against, generate a balanced
reframe, and record a small behavioral pivot. The "Patterns" tab surfaces
recurring distortions over time. The "Reference" tab is an in-app primer.

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

## Your data

- Stored in `localStorage` under the keys `reframe-journal-v1` (entries) and
  `reframe-journal-draft-v1` (in-progress capture). Never sent anywhere.
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
