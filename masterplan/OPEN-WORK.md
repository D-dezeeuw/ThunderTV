# ThunderTV — Open work

> The gap list, derived from [`AUDIT.md`](./AUDIT.md) / [`UPGRADES.md`](./UPGRADES.md)
> and from two random-sampling sweeps over the phase files (one task per phase,
> drawn from every box rather than only open ones). Every item here was
> verified absent in the source at the time of writing, not inferred from a
> checkbox.
>
> **Ordered by what a user loses**, not by effort. §1 is the list to work
> down; §2 and §3 exist so nobody re-discovers them as if they were bugs.

---

## 1. Missing behaviour — a user can tell

| # | Gap | Where it belongs | Size |
| --- | --- | --- | --- |
| **W1** | **Next-episode affordance.** No `nextEpisode()` resolver, no ended-prompt, no `playback.autoAdvance` seam. `position.ts` listens for `ended` only to mark an item watched — episodes play, nothing offers you the next one. | `src/xtream/`, `src/state/series.*`, `src/player/position.ts` | M |
| **W2** | **No live region anywhere.** Zero `aria-live` in the app, so offline, storage-demotion and update notices are silent to a screen reader — and the TV target is a stated 1.0 goal. Phase 25.8.5. | `index.html`, `src/state/ui.*` | S |
| **W3** | **No buffering indicator.** Nothing debounces `waiting`→`playing`, so a stall shows no status at all. Phase 12.8. | `src/player/`, `src/state/player.*` | S |
| **W4** | **Recent shows no timestamps.** 13.5.3 wanted relative labels re-derived on the existing 30 s tick; neither the label nor the `computed()` exists. | `src/state/recent.actions.ts`, `index.html` | S |
| **W5** | **Connect bookmark URLs (Phase 14, unstarted).** `src/core/connect/` holds only the dedup key. No fragment schema, no boot-time parse, no `history.replaceState` scrub, no `save=0` mode, no link generator. A stated core principle in MASTERPLAN §1. | `src/core/connect/` | L |
| **W6** | **PWA offline shell (Phase 24, unstarted; UPGRADES U13).** A manifest with no service worker is an install prompt that leads to a blank page offline. No shell cache, no update flow, no kill-switch, no install prompt. | `public/`, `src/` | L |
| **W7** | **Playlist refresh ignores `ETag`/`304` (15.4).** The conditional-GET pattern exists in `codex/library.ts` and `epg/feed-fetch.ts` but was never applied to playlists, so every refresh re-downloads and re-parses. | `src/state/playlist.actions.ts` | M |
| **W8** | **Favorites: no manual ordering (13.7), no orphan reconciliation (13.8).** A refresh that drops a channel leaves a favourite pointing at nothing, unmarked. | `src/state/favorites.*` | M |
| **W9** | **No `/` search shortcut** (09.7, 21.9.6) and **no match highlighting** (09.10 — an explicit non-goal now, recorded in `src/search/README.md`). | `src/ui/`, `index.html` | S |
| **W10** | **No theater mode (12.2), no volume control or persisted volume key (12.3/12.4).** Playback rides the OS volume; there is no `player.volume`. | `src/state/player.*`, `index.html` | M |

## 2. Engineering debt — no user-visible symptom yet

| # | Gap | Why it matters |
| --- | --- | --- |
| **E1** | **U6: the shadow state layer is unmapped.** ~40 module-scope `let` singletons with no registry, no `resetModuleState()`, no `src/state/reset.ts`. §4.3's flake class is suppressed per-file rather than eliminated, and `__tl.dumpState()` shows half the state. | Precondition for trusting the test suite. |
| **E2** | **U8 step 2: `index.html` is still one file.** `check-markup.mjs` now ratchets it so it can only shrink — the bleeding stopped — but the split into partials has not happened, and it is still the largest artifact on the critical path. | Eager-JS budget headroom is 8%. |
| **E3** | **U9: catalogs bypass the bulk-table surface.** `catalog-storage.ts` persists through ad-hoc small-keyed writes on the `'full'` tier only, outside the versioning envelope and migration hooks. | AUDIT §4.6's largest scar. |
| **E4** | **U12 tail: no CSP header in Electron.** `desktop/main.mjs` has no `onHeadersReceived` policy; the packaged app relies on `file://` and hardened `webPreferences` alone. | The one part of U12 left. |
| **E5** | **U15 tail: no per-leaf i18n fallback.** A locale-chunk failure falls back to `en`, but a key present in `en` and missing from `nl`/`de` still renders `undefined` at runtime. ~15 lines. | Build-time parity is the only guard. |
| **E6** | **U16 tail: the visualizer has no phase file.** The largest single subsystem in the app appears in zero phase files, so §4's status table cannot see it. | How §3.2 happens again. |
| **E7** | **Phase 26 instrumentation.** No `performance.mark` anywhere, no `measure-boot.mjs`, so the cold-start < 1 s, import < 5 s and search < 50 ms budgets are unmeasured prose. | The only budgets still unenforced. |

## 3. Never-performed manual verification

These are procedures, not code. The implementation may well be correct; what
is missing is a record that anyone checked.

- **11.10** — `docs/engine-matrix.md` does not exist; the stream-type × engine ×
  browser grid was never executed.
- **18.1.10** — guide DOM-count smoke (20 favourites × 6 h) never run.
- **02.10.9** — Firefox/Safari smoke; needs a machine with those browsers.
- **07.5.10 / 07.10.7 / 27.6** — Playwright smoke against the built `dist/`.
  `@playwright/test` is still not a dependency; these three are all waiting on
  the same decision.
- **30.3–30.6** — on-device webOS validation: launch time, memory, playback,
  remote navigation, suspend/resume. `webos/PERFORMANCE-BUDGET.md` says
  explicitly that a passing build still needs this.
- **30.10** — the landing page, and the `v1.0.0` tag, which does not exist in
  the repository despite `package.json` reading 1.0.0.

---

## Progress

| Item | State |
| --- | --- |
| **W1** next-episode affordance | ✅ done — `src/xtream/next-episode.ts` + `series.nextPrompt` |
| **W2** live region | ✅ done — `ui.announcement` + `announce()` |
| everything else | open |
