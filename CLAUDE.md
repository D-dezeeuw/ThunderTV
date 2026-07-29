# ThunderTV — agent map

Read this first. It tells you which one or two files answer a given change —
so you don't open 20 files to find out. Don't re-read the masterplan or
module READMEs unless the table below points you there.

See `.claude/AGENTS.md` for branching/commit workflow. See
`.claude/context/thundertv-config-demo.xml` for a sample channel-list export.

## What this is

A static, no-backend IPTV player (M3U/Xtream sources, XMLTV EPG, hls.js/
mpegts.js playback), reactive via [Spektrum](https://github.com/D-dezeeuw/spektrum).
Full rationale: `masterplan/architecture-plan.md`. Build order/phase tracker:
`masterplan/MASTERPLAN.md` + `masterplan/phases/*.md` — only open a phase file
if you need historical "why," not for a routine change.

## Where to look, by change

| You're changing...                                          | Start at |
| ------------------------------------------------------------ | -------- |
| Which channels show in Live, dedup/variants, junk filtering  | `src/channels/README.md` |
| M3U/M3U8 parsing, import pipeline, worker protocol           | `src/m3u/README.md` |
| Xtream Codes API client, endpoints, error taxonomy           | `src/xtream/README.md` |
| EPG (XMLTV ingest, country catalog, matching, now/next, guide) | `src/epg/README.md` |
| Stream health — which feeds actually play, decaying score, dead markers | `src/health/README.md` |
| Player engine (hls.js/mpegts.js/native), dock, theater mode  | `src/player/README.md` |
| Virtual list scrolling, group filtering, logo fallback, gestures | `src/ui/README.md` |
| Any Spektrum state key, action, or selector                 | `src/state/README.md` (has the module-ownership table — check it before adding a key anywhere) |
| Storage (IndexedDB/localStorage/memory tiers, versioning)    | `src/core/storage/README.md` |
| Platform adapter (web vs. Electron, capabilities, testing)   | `src/core/platform/README.md` |
| Network calls, CORS/timeout classification, proxy            | `src/core/http/README.md` |
| Routing, boot sequence, view titles, user-facing copy        | `src/app/README.md` |
| Platform/storage/http foundations, raw-capture diagnostics, source-key dedup | `src/core/README.md` |
| Connect bookmark URLs (`#/connect?...`)                       | `src/core/README.md` — stub, Phase 14 not built yet |
| Test harness for Spektrum-bound DOM                           | `src/shared/README.md` |
| Ambient types (`window.electron`, the vendored `spektrum` types) | `src/types/README.md` |

## Rules that cut across files (check before adding code, not after)

- **Never call Spektrum's `setValue`/`set()` outside `src/state/**`.** ESLint
  enforces this; see `src/state/README.md`'s "Layering rule."
- **Never call `fetch` directly outside `src/core/`.** Go through
  `getPlatform().http`; see `src/core/http/README.md`.
- **Never import a concrete platform/storage implementation directly** —
  always `getPlatform()`; see `src/core/platform/README.md`.
- **No raw UI copy in components** — add it to `src/app/strings.ts`.
- **Adding a Spektrum key?** Register it in `src/state/registry-keys.ts`'s
  `KEY_REGISTRY` *and* the ownership table in `src/state/README.md`, same
  commit.

## Before writing code

1. Find your row in the table above — open that README (or file) first, not
   a directory listing.
2. Only fan out to adjacent files the README explicitly names.
3. Run `npm run typecheck` and the relevant `*.spec.ts` before calling a
   change done; `.claude/AGENTS.md` covers the rest of the workflow.

## Missing a README?

Every `src/*` directory has one now. If you add a new top-level directory,
give it a README modeled on `src/channels/README.md` or `src/state/README.md`
before it grows past a file or two, rather than re-deriving the same context
next time.
