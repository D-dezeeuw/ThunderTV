# ThunderTV — Application Audit

> **Revised.** First measured at `6818418`; re-measured and revised against
> `origin/main` at `6b721fe` after the Movies/TV-Shows UI landed mid-audit.
> Every claim below was verified by running the toolchain or reading the
> code — no finding is inferred from documentation alone.
>
> The revision matters: the audit's original headline finding (Movies, Series
> and Search built but unreachable) was **substantially fixed on `main` while
> this audit was being written**, by commit `70fccf2`. §3.1 records both the
> original measurement and what actually shipped, because the *systemic* cause
> is unchanged and the fix arrived by luck of timing rather than by a gate.

---

## 1. Verdict

ThunderTV is a **well-engineered core wrapped in a delivery process that has
stopped closing the loop.** The foundations (platform adapter, tiered storage,
HTTP error taxonomy, parsing worker, lint fences) are better than most
production codebases. The failure is not in how code is written; it is in
**what reaches the user, and whether the map still matches the territory.**

Three facts define the current state:

1. **Feature reachability is now good, but nothing guarantees it.** Unbound
   actions dropped from 19 of 74 to **6 of 79** when `70fccf2` shipped the
   Movies/Series/Search UI. Two of the remaining six are genuinely orphaned.
   No check would have caught the original 19, and none would catch the next.
2. **The masterplan tracker reports 0/100 for phases 09–30**, while the code
   for phases 09–13, 16–22 and 28–29 demonstrably ships. The project's own
   navigation document is now actively misleading. **Unchanged by the merge.**
3. **The performance budget is drifting away, not toward, its target.** The
   breach widened from 12% over to **20% over** across two merges, because
   nothing measures it.

### Health scorecard

| Dimension | Status | Evidence |
| --- | --- | --- |
| Typecheck | ✅ Clean | `tsc --noEmit` |
| ESLint (`--max-warnings 0`) | ✅ Clean | `npm run lint` |
| CSS fence / file-access fence | ✅ Clean | both custom guards pass |
| Tests | ⚠️ 1,073 pass, **~23% flaky** | 3 red runs in 13 full-suite runs (§4.3) |
| Build | ✅ Succeeds | 616 ms |
| Perf budget | ❌ **Breached, widening** | 71.75 kB gz vs. ≤60 kB budget (was 67.37) |
| Feature reachability | ⚠️ **6/79 unbound** | improved from 19/74; still ungated |
| Plan ↔ code fidelity | ❌ **Detached** | phases 09–30 report 0% while shipping |
| Security posture | ✅ Strong | with two gaps (§4.7) |

---

## 2. What is genuinely excellent

Stated plainly, because the findings below should not read as a condemnation
of the whole.

- **`src/core/http/classified-fetch.ts`** — a real, exhaustive failure
  taxonomy (`cors-or-network` / `http` / `timeout` / `mixed-content` /
  `too-large`) with a `never`-check forcing callers to handle every kind. The
  `crossOrigin` and `offlineHint` flags let the UI say "almost certainly CORS"
  only when it plausibly is. This is the single best-designed module here.
- **Tiered storage** with a real write round-trip probe rather than feature
  detection, and honest demotion. The "in-memory array is the query layer on
  *every* tier" decision is correct and consistently upheld.
- **The lint fences are real and enforced**: no bare `setValue` outside
  `src/state/**`, no `fetch` outside `src/core/`, no `FileReader` outside the
  platform layer, no literal hex colors or CSS transitions. Architecture rules
  that a machine checks are worth ten rules in a README.
- **Security**: Electron runs `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`. Config exports redact URL userinfo plus
  `username`/`password`/`token`/`pass`/`user` query params. Xtream passwords
  are never prefilled into the settings form, and the raw-response export
  redacts the `user_info` credential echo. This was clearly thought about
  rather than bolted on.
- **Documentation density** is exceptional — decisions are recorded with their
  reasoning at the point of use, including the negative space ("a separate
  `action<T>` wrapper was not built, because…"). This is why the audit below
  could be precise.

---

## 3. Critical findings

### 3.1 Features shipped unreachable — fixed by luck, not by a gate

**What the audit originally measured** (at `6818418`): 74 actions registered,
55 bound, **19 unreachable**. `index.html` contained **zero** occurrences of
`movies` or `series` — no rail button, no view, no settings toggle. The `Route`
union had no `'movies'`/`'series'` member. No `search/*` action was bound and
there was no search input, only an unused `#icon-search` sprite symbol and a
comment at `index.html:498` reading *"the surface Phases 09 (search) and 10
(playback) plug into."* Roughly **2,211 LOC of production code plus 1,219 LOC
of passing specs — 18% of the codebase — that no user could reach.**

**What happened next:** while this audit was being written, commit `70fccf2`
("Add Movies and TV Shows tabs: rail, views, category chips, search, detail")
landed on `main` and fixed most of it. Re-measured at `6b721fe`:

| | Before (`6818418`) | After (`6b721fe`) |
| --- | --- | --- |
| Actions registered | 74 | 79 |
| Actions bound in markup | 55 | **73** |
| **Unreachable** | **19 (26%)** | **6 (7.6%)** |
| `movies`/`series` in `index.html` | 0 | 112 |

Of the six remaining, four are legitimately programmatic and belong on an
allowlist rather than in the markup — `list/playSelected` and
`player/setActiveChannel` are called from `list.actions.ts`/`recent.actions.ts`,
and `vod/open`/`series/open` are driven by `src/app/catalog-activation.ts` on
view entry. **Two are genuinely orphaned:** `list/jumpToGroup`
(`groups.actions.ts:20`) and `wizard/close` (`wizard.actions.ts:21`) are
registered via `defineFn` and appear nowhere else in the repository — no
binding, no call site.

**The finding stands, and this is the important part.** The defect was never
"Movies is missing"; it was that **a feature could be 3,430 lines complete,
fully typechecked, fully linted, fully unit-tested, entirely unreachable, and
green in CI.** That is still true today for the next feature. The fix arrived
because someone happened to build the UI, not because anything failed when the
halves were separated. `src/state/README.md` had documented the split
explicitly:

> *"…once the other agent's `src/app/router.ts` change adds `'movies'`/`'series'`
> to the `Route` union — nothing here depends on that union directly … so no
> coordination was required to land this half first."*

Work was split across parallel branches with **no integration gate that fails
when a half arrives alone.** The two orphaned actions above are that same gap,
still open, at smaller scale. [`UPGRADES.md`](./UPGRADES.md) U1 closes it.

Related: the app has **zero `data-model` bindings**, despite `data-model` being
named as one of the four core Spektrum bindings in the masterplan. Every input
is read imperatively via refs.

### 3.2 The masterplan tracker no longer describes the codebase

Checkbox completion per phase file:

| Phases | Tracker says | Reality |
| --- | --- | --- |
| 01–08 | 99–100/100 | Matches |
| **09–30** | **0/100 for all 22 phases** | Search, player, HLS/mpegts, dock/theater, favorites, EPG ingest/display/guide, Xtream client/live/VOD, settings, Electron shell and packaging **all ship** |

`CLAUDE.md` instructs every agent to treat `masterplan/MASTERPLAN.md` and the
phase files as the build-order source of truth. An agent following that
instruction today would conclude that playback, EPG, and Xtream do not exist
and rebuild them.

The declared way of working (§3 of the masterplan: branch `feature/phase-NN-slug`,
check boxes in the same commits, merge with all boxes checked) was abandoned
after Phase 08. Actual branches are ad-hoc: `claude/vod-filtering-search-plan-eqmvai`,
`claude/radio-spectrum-visualizer-k8z226`, `claude/tooltip-icon-hover-2f80av`.

**The tracker is not merely stale — it inverts the truth for 73% of the plan.**

---

## 4. High and medium findings

### 4.1 Performance budget breached, and nothing enforces it

The masterplan's standing verification checklist mandates **"initial JS ≤ ~60 KB
gz app code (+ ~6 KB Spektrum)."** Actual, at `6b721fe`:

```
dist/assets/index-*.js    211.68 kB │ gzip:  71.75 kB   ← 20% over budget
dist/index.html           160.58 kB │ gzip:  21.79 kB
dist/assets/index-*.css    29.68 kB │ gzip:   4.96 kB
```

Lazy-loaded engines (`hls` 157 kB gz, `mpegts` 62 kB gz) are correctly split
and not counted. The breach is in first-load app code.

**The trend is the finding, not the number.** Across the two merges observed
during this audit, app JS went 67.37 → 71.75 kB gz (+6.5%) and the HTML shell
16.58 → 21.79 kB gz (+31%). The breach went from 12% over to 20% over **in two
commit ranges, silently**, because no script measures it and nothing in CI
would ever notice. An unmeasured budget is not a budget.

### 4.2 Guard scripts exist but never run

`scripts/check-importmap.mjs` and `scripts/check-dist.mjs` are written,
documented, and **wired into nothing** — absent from `package.json` scripts and
from `.github/workflows/ci.yml`.

What is silently unguarded as a result:

- The pinned-Spektrum contract (import-map URL drift, vendored-copy SHA-384
  divergence) — the entire point of `check-importmap.mjs`.
- Root-absolute asset paths in `dist/index.html`, which break GitHub Pages
  subpaths, Electron `file://`, and webOS packaging.
- `FakePlatform` leaking into the production bundle — the script's own comment
  states *"Nothing besides dead-code elimination keeps it out today."*

CI also never runs `npm run build`, so a broken production build reaches `main`
with a green check.

### 4.3 Active flake from module-singleton leakage

**Reproduced 3 times in 13 full-suite runs (~23%)** across both commits, always
in `src/m3u/import-run.spec.ts`, which passes 10/10 in isolation. **Which**
tests in that file fail varies run to run — a different set each time, which is
the signature of cross-file ordering rather than a bad assertion:

```
FAIL  cancelImport() allows a fresh runImport() to proceed shortly afterward
FAIL  a header-less parse failure rejects cleanly and leaves zero trace
FAIL  upserts an existing m3u-url source instead of creating a second one
FAIL  never records an array of channel rows in Spektrum state during a real import
```

```
Error: runImport(): an import is already in flight — call cancelImport() first.
  ❯ runImport src/m3u/import-run.ts:87
```

`import-run.ts:59` holds `let active: ActiveImport | null = null` at module
scope. Under the full suite, that singleton survives across tests with no reset
hook, so whichever test runs after a leaked import fails — and which test that
is depends on scheduling.

**This is the highest-priority item in §4.** A roughly one-in-four red CI is
worse than a consistently red one: it trains everyone to re-run rather than
investigate, and it will mask a real regression the first time one appears.
It is also cheap to fix — [`UPGRADES.md`](./UPGRADES.md) U6's reset hook closes
the whole class, and a `beforeEach(cancelImport)` closes this instance today.

### 4.4 The shadow state layer

The (correct) rule that bulk data must never enter Spektrum pushed a large
amount of real application state into **~40 module-scope `let` singletons**:

```
src/ui/virtual-list.ts     allRows, rowIndexById, scrollTop, rowH,
                           visibleCount, viewportHeight, rafHandle,
                           containerEl, resizeObserver          (9)
src/state/live-rows.ts     grouped, displayRows, radioGrouped,
                           radioRows, builtFrom, radioBuiltFrom (6)
src/state/search.actions.ts currentQuery, currentScope,
                           channelIndexSource, channelSearchKeys (4)
… plus openInFlight / warmInFlight / busy / cachedSource flags across
  vod.actions, series.actions, vod-warm, series-warm, xtream-refresh,
  xtream.actions, import-triggers, import-run, groups, debug
```

This is a **second, undeclared state system**. It is not in `KEY_REGISTRY`, not
persisted, not inspectable via `__tl.dumpState()`, not covered by the bulk-data
guard, and — as §4.3 shows — not resettable between tests. `src/state/README.md`
maps the Spektrum half of the app's state with great care; the other half has
no map at all.

### 4.5 The framework is being fought, twice

Two workarounds are load-bearing and both stem from Spektrum's semantics not
matching what the app needs:

- **`typed.ts`'s `replace()`** must write `undefined`, call `tick()`
  explicitly, then write the real value — because `setValue()` *deep-merges*
  object values instead of replacing them, so removing a favorite by writing a
  smaller object silently leaves the removed key in live state. The README
  concedes *"Calling `tick()` from application code is otherwise unheard of in
  this codebase."*
- **`sequence-token.ts`** exists because a value written with `set()` is not
  readable via `get()` until the next tick, so an async action cannot detect
  "did a newer call supersede me" by re-reading its own write.

Both are documented, tested, and correctly reasoned. Both are also a signal
that the reactive core's contract is a poor fit for async, map-shaped state —
and the workarounds are unenforceable conventions. Nothing stops the next
`Record<string, T>` key from using `set()` and reintroducing the bug.

### 4.6 Phase boundaries are leaving permanent architectural scars

Several structural decisions were driven by *process scope*, not by design.
Each is honestly documented, which is how they were found:

- **`catalog-storage.ts` bypasses the bulk-table system entirely** —
  *"adding one would mean touching `src/core/storage/**`, outside this phase's
  `src/state/`-only mandate."* VOD/series catalogs now persist through ad-hoc
  small-keyed writes, on the `'full'` tier only, outside the versioning
  envelope and the storage README's documented "two surfaces" contract.
- **`registry-overflow.ts` exists only because `registry.ts` hit the 400-line
  ESLint ceiling** — *"registry.ts was already at eslint's 400-line max-lines
  ceiling with zero slack."* The single source of truth is now assembled from
  two files by a spread, for a lint reason.
- **`ChannelRow` still has no normalized search key** — *"adding one is outside
  this phase's `src/state/`-only scope"* — so `search.actions.ts` maintains a
  parallel `Map<string, string>` cache invalidated by array reference identity.
- **Movies/Series/Search selections corrupt the per-source `selectedId`
  cursor** — a known side effect left in place because fixing it was *"out of
  this phase's scope."*

A phase boundary is a scheduling device. When it becomes a *design* boundary,
the scars are permanent and compound.

### 4.7 Security: two gaps in an otherwise strong posture

- **No Content-Security-Policy anywhere.** No `<meta http-equiv>` in
  `index.html`, no `session.webRequest` header in `desktop/main.mjs`. For an
  app that loads remote channel logos, remote streams, and a CDN module, this
  is the single cheapest missing mitigation.
- **The runtime Spektrum load has no integrity enforcement.** The import map
  resolves to `https://unpkg.com/spektrum@1.1.0/spektrum.min.js`, and import
  maps cannot carry an `integrity` attribute. `check-importmap.mjs` validates
  the *vendored* copy's SHA-384 at build time — it cannot constrain what the
  browser actually fetches. A unpkg compromise is arbitrary code execution in
  the web target, with no CSP to contain it. (Packaged builds swap to the
  vendored copy via `package-target.mjs` and are unaffected.)

### 4.8 `index.html` is an unlinted 2,366-line monolith — and growing fast

160.58 kB raw, 21.79 kB gzipped — nearly a third of the app JS payload again, on
the critical path, shipped on every load with no code splitting. It contains the
nav rail, every view, the entire settings panel (11 `<section>` blocks), the
wizard, the debug panel, and a 6 KB inline SVG sprite.

It grew **29% across two merges** (1,829 → 2,366 lines) as the Movies/Series and
Categories-preview views landed — the predictable consequence of the asymmetry
below, rather than a criticism of those commits.

The asymmetry is the finding: **TypeScript files are hard-capped at 400 lines by
ESLint; the single largest and most-edited UI artifact in the repo has no limit
at all.** That gradient reliably pushes complexity into markup, where
`data-if="…"` expressions become untestable, ungrepped logic.

### 4.9 vod/series twins were factored halfway

Four near-identical file pairs remain after the shared `catalog-*.ts` core was
extracted:

| Pair | Divergence after name normalization |
| --- | --- |
| `vod.actions.ts` / `series.actions.ts` | 297 diff lines of 540 |
| `vod.ts` / `series.ts` | 116 diff lines of 189 |
| `vod-rows.ts` / `series-rows.ts` | 206 LOC combined |
| `vod-warm.ts` / `series-warm.ts` | 200 LOC combined |

The parameterized core (`catalog-warm`, `catalog-memory`, `catalog-storage`,
`catalog-sort`) proves the abstraction works. It was applied to persistence and
warming, then abandoned before actions and rows.

### 4.10 Priority inversion: the radio visualizer

Production LOC only (specs excluded), at `6b721fe`:

| Module | LOC | In the 30-phase plan? |
| --- | --- | --- |
| Radio visualizer + 12 presets | **2,042** | **No** — appears in zero phase files |
| Search core (`src/search`) | 333 | Phase 09 |
| EPG core (`src/epg`) | 162 | Phases 16–18 |

The visualizer is competent work and users may well love it. But it is **12.6×
the EPG core** and 6× the search core, entirely off-plan, and it grew again
(1,969 → 2,042) in the same merge window. Four of the last fifteen commits are
visualizer work. It is now the single largest subsystem in the app that the
plan does not mention at all.

### 4.11 Smaller items

- **PWA is half-built.** `public/manifest.webmanifest` exists and is valid; there
  is no service worker anywhere in `src/` or `index.html`. The app is
  installable but has no offline shell — Phase 24 unstarted.
- **Accessibility is partial.** Keyboard navigation exists for the channel list
  and groups panel (`ArrowUp`/`ArrowDown`). There is no global roving-tabindex
  model and no spatial/D-pad navigation — meaning the webOS TV target (Phase 30)
  currently has no viable input story. ARIA usage is thin outside the rail: 1
  `aria-pressed`, 2 `aria-selected` across the entire app.
- **i18n has no fallback path at runtime.** `strings.spec.ts` asserts key-set
  parity across `en`/`nl`/`de` at build time, which is good, but a missing leaf
  at runtime renders `undefined` rather than falling back to `en`.
- **`src/state/` is 37% of the production codebase** (7,537 of 20,127 LOC across
  80 files). Some of that is genuine state; a substantial fraction is
  application logic that landed in `state/` because the layering rule made it
  the path of least resistance.

---

## 5. Root-cause summary

Every critical finding traces to one of three causes:

| Cause | Findings | The pattern |
| --- | --- | --- |
| **Nothing is measured, so nothing holds** | §3.1, §4.1, §4.2, §4.8 | Reachability, bundle size, and markup size are all governed by documents rather than scripts. Each drifted. The perf budget widened 12%→19% during this audit; `index.html` grew 28%; the reachability gap closed only because someone happened to build the UI. |
| **The map is not maintained with the territory** | §3.2, §4.4 | The masterplan and `state/README.md` are excellent *when accurate*. Nothing forces them to stay accurate, so the tracker inverted and the shadow state layer went unmapped entirely. |
| **Process scope treated as design scope** | §4.6, §4.9, §4.10 | Phase mandates ("`src/state/`-only") and lint ceilings (400 lines) made permanent architectural decisions that no one would have chosen on the merits. |

The mid-audit merge is the clearest evidence for the first row. In one commit
range the codebase **fixed** its largest reachability defect and **worsened**
two measured budgets, and CI reported exactly the same green for all of it.

The encouraging read: **none of these are code-quality problems.** The code is
good — 1,073 tests, clean typecheck, clean lint, four real lint fences that all
hold. The problems are at the seams: between branches, between plan and
implementation, between state and markup. Seams are cheap to fix once named,
and every fence this project already has works.

Fixes are specified in [`UPGRADES.md`](./UPGRADES.md). The long-horizon target
is [`VISION-3.0.md`](./VISION-3.0.md).
