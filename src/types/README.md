# src/types/

Ambient type declarations — no runtime code, nothing here is imported by
value, only picked up by the TypeScript compiler.

- `spektrum.d.ts` — `declare module 'spektrum'` wrapping the real published
  types (verbatim from `spektrum@1.1.0`'s own `.d.ts`). Needed because
  Spektrum is never an npm dependency — it's resolved at runtime through the
  import map (pinned CDN URL in `index.html`, vendored fallback in
  `public/vendor/` for packaged targets), so TypeScript has nothing to
  resolve `import ... from 'spektrum'` against otherwise. **Keep this in
  lockstep with `scripts/spektrum-version.json`'s pin** — bump both together
  when the CDN version changes, or types silently drift from the real API.
- `platform.d.ts` — declares `window.electron?: unknown`. Presence, not
  shape, is all `createPlatform()` needs to pick the Electron vs. web
  adapter (`src/core/platform/create-platform.ts`); the real preload bridge
  type arrives in Phase 28.

## Rule

Don't hand-edit the Spektrum type surface here to fit a call site — if the
pinned version's types are wrong or missing something, fix the version pin
or work around it at the call site instead.
