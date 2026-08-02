# src/core/

Host-agnostic foundations everything else builds on: the platform adapter,
storage tiers, the classified HTTP client, and two small standalone utils.
Nothing in here imports `src/state/`, `src/ui/`, or Spektrum — this layer is
what the rest of the app depends on, never the reverse.

Each subdirectory has its own README with the real detail:

- `platform/README.md` — `PlatformAdapter`, `getPlatform()`/`setPlatform()`,
  capabilities-not-environment-checks, `FakePlatform` for tests.
- `storage/README.md` — the IndexedDB → localStorage → memory tier probe,
  the keyed-snapshot vs. bulk-table split, versioning, chunked writes.
- `http/README.md` — `classifiedFetch`'s failure taxonomy (`timeout`,
  `cors-or-network`, `mixed-content`, …) and the optional proxy template.
- `subtitles/README.md` — free, keyless, CORS-open subtitle lookup for
  Movies/TV Shows: which service, the CORS evidence, the IMDb-id
  identification ladder, and the cache.
- `connect/` — reserved for Phase 14's `#/connect?...` bookmark-URL parsing;
  today only `source-key.ts` lives here (see below), the rest is a stub
  (`index.ts` is `export {}`).

## Top-level files

- `raw-capture.ts` — an in-memory, size-capped buffer of unmodified provider
  HTTP responses (M3U/Xtream), credential-redacted, for diagnosing "the app
  shows the wrong thing" against "the provider actually sent this." Session
  memory only, deliberately never persisted — see the file's own comment for
  why persisting a provider's full catalogue isn't worth it as a diagnostic.
- `redact.ts` — the one credential scrubber. `redactUrl()` for a value that
  *is* a URL (parse-based: userinfo, credential query params, and the
  `/live/{user}/{pass}/` path shape), `redactText()` for free text that may
  contain one (regex sweeps, never throws — this runs on the debug console's
  ingress path), and `redactJsonCredentialFields()` for a captured provider
  body, which stays deliberately narrower so the capture remains a near-exact
  copy. `CREDENTIAL_PARAMS` is shared with `health/stream-key.ts`, which masks
  the same parameters to build a persisted identity rather than a display
  string. **Never write a sixth local redactor** — that is how the five this
  replaced ended up disagreeing about userinfo and `token`.
- `connect/source-key.ts` — `makeSourceKey()`/`normalizeUrlKey()`: the one
  normalization rule for treating two playlist sources as "the same" source
  (masterplan §5.6). Both Phase 07's dedup-on-import and the future Phase 14
  connect-bookmark/Phase 15 refresh flows must consume this byte-for-byte
  rather than re-deriving their own key — that's the whole point of it
  living in `core/` instead of next to either caller.

## Rule

Anything that needs to differ between web and Electron, or between storage
tiers, goes through the adapter interfaces here — never a `window.electron`
check or a `localStorage`/`fetch` call outside this directory (both are
ESLint-fenced).
