# Vendored: Spektrum

- **Package:** `spektrum` on npm
- **Version:** 1.1.0 (pinned — see `../../scripts/spektrum-version.json`)
- **Upstream repository:** https://github.com/D-dezeeuw/spektrum
- **License:** MIT
- **File:** `spektrum.min.js`, fetched verbatim from
  `https://unpkg.com/spektrum@1.1.0/spektrum.min.js`

This file is committed as-is so packaged targets (Electron, webOS) and the
future PWA offline path never depend on the CDN — see masterplan §2/§6.10.
It is excluded from linting, formatting, and type-checking (this directory
is never source code).

**Do not hand-edit this file.** Update it only via
`node scripts/sync-vendor-spektrum.mjs`, which re-downloads the pinned
version and verifies/updates the SHA-384 recorded in
`scripts/spektrum-version.json`.

## Vendored: es-module-shims

- **Package:** `es-module-shims` on npm
- **Version:** 2.8.4 (pinned — see `../../scripts/es-module-shims-version.json`)
- **Upstream repository:** https://github.com/guybedford/es-module-shims
- **License:** MIT
- **File:** `es-module-shims.js`, fetched verbatim from
  `https://unpkg.com/es-module-shims@2.8.4/dist/es-module-shims.js`

Only the webOS build injects a `<script>` tag pointing at this file
(`scripts/package-target.mjs`) — it polyfills `<script type="importmap">`
support for Chromium <89, which some webOS TV engines still ship. Web and
Electron builds never reference it.

**Do not hand-edit this file.** Update it only via
`node scripts/sync-vendor-es-module-shims.mjs`.
