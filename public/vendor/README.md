# Vendored: Spektrum

- **Package:** `spektrum` on npm
- **Version:** 1.1.0 (pinned — see `../../scripts/spektrum-version.json`)
- **Upstream repository:** https://github.com/D-dezeeuw/spektrum
- **License:** MIT
- **File:** `spektrum.min.js`, fetched verbatim from
  `https://unpkg.com/spektrum@1.1.0/spektrum.min.js`

This file is committed as-is so every target, including web, stays
independent of a runtime CDN — see masterplan §2/§6.10.
It is excluded from linting, formatting, and type-checking (this directory
is never source code).

**Do not hand-edit this file.** Update it only via
`node scripts/sync-vendor-spektrum.mjs`, which re-downloads the pinned
version and verifies/updates the SHA-384 recorded in
`scripts/spektrum-version.json`.

## Generated files (both from `scripts/spektrum-csp.mjs`)

`spektrum-precompiled.js` is generated from `index.html`. It registers every
template expression before `bindDOM()`, allowing a strict script CSP without
`unsafe-eval`.

`spektrum.runtime.js` is **what the app actually loads** — `spektrum.min.js`
with one value changed. In 1.1.0 `precompile()` and expression lookup share
a single bounded LRU (cap 500), so registering this template's 724
expressions evicted its own earliest registrations before `bindDOM()` ran.
Those then fell back to `new Function(...)`, which the CSP blocks, and the
app rendered every label blank. The transform raises the cap; it refuses to
run unless `spektrum.min.js` matches the pinned SHA-384, and it derives the
minified identifier rather than hard-coding it, so a reshaped upstream build
fails loudly instead of patching nothing.

`spektrum.min.js` is therefore the integrity-checked *input* to that
transform rather than the file the page fetches. Nothing imports it
directly. When upstream gives `precompile()` its own unbounded map, delete
the transform and point `index.html`'s import map back at it.

Regenerate both with `npm run spektrum:csp`; `npm run verify` fails if
either is stale.
