# src/app/

Boot sequence, hash router, view-switch side effects, and centralized UI copy
— the glue that turns `src/core`/`src/state`/feature modules into a running
page. Nothing here owns a Spektrum key of its own except `ui.activeView`
(see below); the actual view/list/player modules live under `src/ui/`,
`src/player/`, etc.

- `bootstrap.ts` — `bootstrap()` is the one real boot order (masterplan
  §4/§6.4): platform → state (seed, then rehydrate) → render (`bindDOM()`/
  `run()`) → only *after* first paint, the heavy stuff (EPG tick, playlist
  load, Xtream refresh). If you're adding a new "run once at startup" step,
  it goes here, and it matters whether it lands before or after `run()`.
  It also wires up `src/state/boot.ts`'s wallpaper splash (`ui.bootPhase`):
  passes it the sources-load promise and gives `registerListBindings()` a
  callback for "the first Live paint landed," so the overlay can fade out
  once real data (or the first-run wizard) is actually ready.
- `router.ts` — hand-rolled `#/path?query` hash router. `applyRoute()` is
  the **sole** writer of `ui.activeView` — enforced by the ESLint carve-out
  documented in `src/state/README.md`'s "Sanctioned non-action publishers."
  Never set that key from anywhere else.
- `views.ts` — subscribes to `ui.activeView` to save/restore each view's
  scroll position (module memory, not Spektrum state — it's UI ephemera, not
  durable data) and set `document.title`.
- `strings.ts` — every user-facing string lives here, grep-verified
  elsewhere to contain none. Adding UI copy means adding a key here, not an
  inline literal at the call site.
- `format.ts` — small `{count}`-template pluralization helper shared by
  import summaries and (eventually) search result counts.
- `index.ts` — re-exports `bootstrap` for `main.ts`.

## Rule

`ui.activeView` has exactly one writer (`router.ts`). If a feature needs to
navigate, it changes `location.hash` and lets the router react — it does not
call `setValue('ui.activeView', ...)` itself.
