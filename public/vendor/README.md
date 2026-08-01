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

`spektrum-precompiled.js` is generated from `index.html` by
`scripts/spektrum-csp.mjs`. It registers every template expression before
`bindDOM()`, allowing a strict script CSP without `unsafe-eval`.
