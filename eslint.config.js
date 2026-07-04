// Lint-only config — catches real bugs (undeclared globals, unreachable code,
// dead branches) without imposing any stylistic/formatting rules on the
// hand-tuned source. There is no build step, so this is the only automated
// guard against the classes of typo that a transpiler would otherwise surface.
// Globals are declared inline so the config carries no extra dependency.

import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly',
  localStorage: 'readonly', sessionStorage: 'readonly', location: 'readonly',
  fetch: 'readonly', URL: 'readonly', Response: 'readonly', Request: 'readonly',
  Blob: 'readonly', File: 'readonly', FileReader: 'readonly', FormData: 'readonly',
  URLSearchParams: 'readonly', AbortController: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
  clearInterval: 'readonly', requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly', queueMicrotask: 'readonly',
  console: 'readonly', crypto: 'readonly', TextEncoder: 'readonly',
  TextDecoder: 'readonly', Uint8Array: 'readonly', atob: 'readonly', btoa: 'readonly',
  matchMedia: 'readonly', getComputedStyle: 'readonly', alert: 'readonly',
  confirm: 'readonly', prompt: 'readonly',
  BroadcastChannel: 'readonly', CustomEvent: 'readonly', Event: 'readonly',
  MutationObserver: 'readonly', IntersectionObserver: 'readonly',
  performance: 'readonly', structuredClone: 'readonly', Intl: 'readonly',
  StorageEvent: 'readonly',
  // App + library globals shared across the separately-loaded scripts.
  Peer: 'readonly',
};

// app.js, js/sync.js and js/pwa.js are loaded as plain (non-module) scripts on
// the same page, so they share one global scope. Each file is granted only the
// names the OTHER scripts define — granting a file its own exports as ambient
// globals would blind no-undef to a deleted/renamed definition in that file.
const appProvides = {
  state: 'readonly', render: 'readonly', persist: 'readonly',
  toast: 'readonly', normalizeEntry: 'readonly', setState: 'readonly',
  setStoredPin: 'readonly', hasPin: 'readonly', isUnlocked: 'readonly',
};
const syncProvides = {
  renderSyncPanel: 'readonly', syncBroadcast: 'readonly',
  syncRecordEntryDeletion: 'readonly', syncClearEntryDeletion: 'readonly',
};
const pwaProvides = {
  installPWA: 'readonly', refreshPWAInstallUI: 'readonly',
};

const workerGlobals = {
  self: 'readonly', caches: 'readonly', clients: 'readonly', fetch: 'readonly',
  Response: 'readonly', Request: 'readonly', URL: 'readonly', console: 'readonly',
  BroadcastChannel: 'readonly', Promise: 'readonly',
};

const nodeGlobals = {
  process: 'readonly', console: 'readonly', URL: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', Buffer: 'readonly',
};

// Start from the full recommended set (no-const-assign, no-fallthrough,
// no-dupe-else-if, no-self-assign, no-unsafe-optional-chaining, …) and relax
// only the two rules the codebase deliberately deviates on.
const sharedRules = {
  ...js.configs.recommended.rules,
  'no-cond-assign': ['error', 'except-parens'],
  'no-constant-condition': ['error', { checkLoops: false }],
  // Scripts share one page-global scope; assigning over a shared global
  // (e.g. `state = null` in sync.js) would clobber another file's export.
  'no-global-assign': 'error',
  // The codebase intentionally uses empty `catch(_) {}` for best-effort writes.
  'no-empty': ['warn', { allowEmptyCatch: true }],
  // Unused vars stay warnings so CI is not blocked by stylistic noise; `_`
  // catch bindings are the blessed intentionally-unused pattern.
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
};

export default [
  { ignores: ['js/vendor/**', 'node_modules/**', 'smoke-shots/**'] },
  {
    files: ['app.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, ...syncProvides, ...pwaProvides },
    },
    rules: sharedRules,
  },
  {
    files: ['js/pwa.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, ...appProvides },
    },
    rules: sharedRules,
  },
  {
    files: ['js/sync.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserGlobals, ...appProvides },
    },
    rules: sharedRules,
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: workerGlobals,
    },
    rules: sharedRules,
  },
  {
    // Test files mix Node driver code with browser-context callbacks passed to
    // Playwright's page.evaluate / addInitScript, so they legitimately see both
    // global sets. ESLint can't tell which closures run where, so allow both.
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...nodeGlobals, ...browserGlobals, ...appProvides, ...syncProvides, ...pwaProvides },
    },
    rules: sharedRules,
  },
  {
    files: ['eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: sharedRules,
  },
];
