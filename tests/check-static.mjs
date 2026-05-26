// Fast static sanity checks — no browser. Run before the Playwright walk so
// obvious breakage (a syntax error in the inline script, a missing precache
// asset, a malformed manifest) fails in seconds instead of after a browser
// boot. Runs in CI and locally via `node tests/check-static.mjs`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const problems = [];
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { problems.push(m); console.log(' FAIL ' + m); };

// 1. Standalone JS files parse. The app logic lives in external app.js
//    (extracted from index.html); js/pwa.js bootstraps the SW; sw.js is the
//    worker itself.
for (const f of ['js/pwa.js', 'sw.js', 'app.js']) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
    ok(`${f} parses`);
  } catch (e) {
    bad(`${f} syntax error:\n${e.stderr?.toString() || e.message}`);
  }
}

// 2. index.html is a thin shell: it must reference the external CSS + JS and
//    carry no leftover inline <style>/<script> blocks (the strict script-src
//    CSP would silently break any inline script that crept back in).
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!/<link[^>]+href=["']styles\.css["']/.test(html)) bad('index.html does not link styles.css');
else ok('index.html links styles.css');
if (!/<script[^>]+src=["']app\.js["']/.test(html)) bad('index.html does not load app.js');
else ok('index.html loads app.js');
if (/<style[\s>]/i.test(html)) bad('index.html still has an inline <style> block (should be in styles.css)');
else ok('no inline <style> in index.html');
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].filter((m) => m[1].trim());
if (inlineScripts.length) bad(`index.html has ${inlineScripts.length} inline <script> block(s); strict CSP forbids them`);
else ok('no inline <script> in index.html (CSP-safe)');
for (const f of ['styles.css', 'app.js']) {
  if (!existsSync(path.join(ROOT, f))) bad(`${f} missing on disk`);
}

// 3. manifest.json is valid JSON with the fields a PWA needs.
try {
  const m = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  if (!m.start_url) bad('manifest.json missing start_url');
  if (!Array.isArray(m.icons) || m.icons.length === 0) bad('manifest.json has no icons[]');
  else {
    for (const icon of m.icons) {
      const rel = (icon.src || '').replace(/^\.?\//, '');
      if (rel && !existsSync(path.join(ROOT, rel))) bad(`manifest icon missing on disk: ${icon.src}`);
    }
  }
  if (problems.length === 0 || !problems.some((p) => p.startsWith('manifest'))) ok('manifest.json valid + icons exist');
} catch (e) {
  bad('manifest.json invalid JSON: ' + e.message);
}

// 4. sw.js: CACHE_NAME shape + every precached asset exists on disk.
const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const cacheName = sw.match(/CACHE_NAME\s*=\s*'([^']+)'/)?.[1];
if (!cacheName || !/^reframe-v\d+$/.test(cacheName)) {
  bad(`sw.js CACHE_NAME malformed or missing (got ${JSON.stringify(cacheName)}; want reframe-vNN)`);
} else {
  ok(`sw.js CACHE_NAME = ${cacheName}`);
}
const assetsBlock = sw.match(/const ASSETS\s*=\s*\[([\s\S]*?)\]/)?.[1] || '';
const assets = [...assetsBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((a) => a !== './');
for (const a of assets) {
  const rel = a.replace(/^\.?\//, '');
  if (!existsSync(path.join(ROOT, rel))) bad(`sw.js precaches missing asset: ${a}`);
}
if (assets.length && !problems.some((p) => p.includes('precaches missing'))) ok(`sw.js precache list (${assets.length} assets) all exist`);

if (problems.length) {
  console.error(`\nStatic checks failed (${problems.length}).`);
  process.exit(1);
}
console.log('\nAll static checks passed.');
