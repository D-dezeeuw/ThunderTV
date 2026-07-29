# ThunderTV — Upgrade Plan

> The remediation companion to [`AUDIT.md`](./AUDIT.md). Every item names the
> finding it closes, the concrete change, and the check that keeps it closed.
>
> Ordered by **leverage**, not by effort. U1–U4 are the ones that stop the
> bleeding; everything after is compounding improvement.
>
> **Status:** U1, U2, U3, U4 and U7 have landed. What they actually cost and
> what they bought is recorded inline below, so the next person can judge the
> remaining items against real numbers rather than my estimates.

**Guiding rule for this plan:** prefer a *machine-enforced gate* over a
documented convention. Every finding in the audit that stayed fixed was
enforced by a script (the `setValue` fence, the CSS fence, the FileReader
fence). Every finding that drifted was enforced by a README.

---

## Tier 0 — Stop the bleeding

### U1. Wire an integration gate that fails on unreachable features
**Closes §3.1 (critical), and prevents its recurrence. — ✅ LANDED**

Shipped as `scripts/check-reachability.mjs` + `scripts/reachability-allowlist.json`,
wired into `npm run verify` and CI. It also fails on a `data-view` outside the
`Route` union, and on allowlist entries that have gone stale (no such action)
or redundant (bound in markup after all) — an exemption list that cannot be
audited rots into a second place for dead code to hide.

Verified against both real defect classes before trusting it: unbinding an
action and adding an unrouted `data-view` each fail with exit 1. Current state:
77 registered, 73 bound, 4 allowlisted, 0 dead clicks.

The single highest-leverage change in this document. A new
`scripts/check-reachability.mjs`, wired into `package.json` and CI:

1. Parse every `defineFn('name', …)` registration across `src/**`.
2. Parse every `data-fn="name"` in `index.html`.
3. **Fail** on any registered action with no binding, unless it appears in an
   explicit `scripts/reachability-allowlist.json` with a one-line reason
   (e.g. `player/setActiveChannel` — called programmatically, never clicked).
4. **Fail** on any bound `data-fn` with no registration (dead clicks — zero
   today, and worth keeping at zero).
5. Extend the same idea to routes: every value in `Route` must have a
   `data-view` in the markup, and every `data-view` must be in `Route`.

The allowlist is the important design detail: it makes "this is intentionally
unbound" a **deliberate, reviewed, one-line act** rather than a silent default.

### U2. ~~Ship or delete Movies / Series / Search~~
**Closes §3.1. — ✅ LANDED (the bulk on `main` by `70fccf2`; the tail here)**

The bulk of this item was completed while the audit was being written: the
Movies/TV-Shows rail, views, category chips, search and detail panes shipped,
taking unbound actions from 19/74 to 6/79. `catalog-activation.ts` now drives
`openVodCatalog()`/`openSeriesCatalog()` and the per-catalog warms on view
entry. **No action needed on the main body of this item.**

The tail is now closed too — all three deleted rather than bound, since
nothing wanted them:

- `list/jumpToGroup` and `wizard/close`, both registered with no binding and
  no call site. `wizard/close` was byte-identical to the bound `wizard/skip`.
- `src/state/warm.ts`'s `warmCatalogs()`, exported and called by nobody —
  `catalog-activation.ts` calls the two per-catalog warms individually.

U1's check is what forces that choice from here on: an action with no binding
and no allowlist entry now fails the build.

**The lesson to keep, since the finding is closing:** this was fixed because
someone happened to build the UI, not because anything failed when the halves
were separated. U1 is what makes the fix durable — without it, the next feature
can repeat the whole thing and CI will stay green throughout.

### U3. Wire the guards that already exist
**Closes §4.2. — ✅ LANDED**

`lint:importmap`, `lint:reachability` and `lint:dist` are now npm scripts, and
CI is a single `npm run verify` step so local and CI cannot diverge again.

The estimate of "~15 minutes" was right about the wiring and wrong about the
consequence: `check-dist.mjs` **failed the moment it was first run**, at
208.7 kB against its own 200 kB startup budget. That guard had been written,
documented, and never executed, so the budget it existed to protect had been
breached silently for an unknown number of commits. Below, for reference:

```jsonc
// package.json
"lint:importmap": "node scripts/check-importmap.mjs",
"lint:dist":      "node scripts/check-dist.mjs",
"verify":         "npm run typecheck && npm run lint && npm run lint:css && npm run lint:file-access && npm run lint:importmap && npm test && npm run build && npm run lint:dist"
```

Then reduce `.github/workflows/ci.yml` to `npm ci && npm run verify`, so the
local and CI definitions of "green" can never diverge again. Note that CI
currently never runs `npm run build` at all.

### U4. Enforce the performance budget
**Closes §4.1. — ✅ LANDED**

Implemented inside `check-dist.mjs` rather than as a separate
`perf-budget.json`: it already owned the raw entry-chunk ceiling, so the gzip
transfer budget belongs next to it rather than in a second mechanism. Both are
enforced on every `npm run verify`.

It did **not** have to land failing, as this plan assumed — the optimization
work below got under both budgets first. Final: **135.7 kB raw / 46.0 kB gz**
against 200 kB / 60 kB, down from 213.8 kB / 72.5 kB.

Extend `check-dist.mjs` with gzipped-size assertions read from a committed
`scripts/perf-budget.json`:

```jsonc
{
  "app-js-gz":  61440,   // masterplan's ≤60 kB — currently 71.75 kB, FAILING
  "css-gz":     10240,
  "html-gz":    20480,   // currently 21.79 kB, FAILING
  "worker-gz":  10240
}
```

**This item got more urgent, not less.** During the audit window the app JS went
67.37 → 71.75 kB gz and the HTML shell 16.58 → 21.79 kB gz, moving the breach
from 12% to 20% over budget across two merges, with CI green throughout. The
budget is drifting away from its target at a measurable rate precisely because
nothing measures it.

Land the check **failing**, with the current overage recorded as a `TODO` that
blocks release but not the merge, then close the gap. Options, cheapest first:
split the settings panel and wizard markup out of the initial HTML payload
(§U8); lazy-load the visualizer presets (2,042 LOC that only the Radio view
needs); split the locale dictionaries — now six files across `strings.*.ts` and
`strings.*.catalog.ts` — into a dynamic import per locale rather than shipping
all three languages to every user.

---

## Tier 1 — Restore truth

### U5. Reconcile the masterplan with reality
**Closes §3.2.**

The tracker reports 0/100 for 22 phases that largely ship. Two changes:

1. **One reconciliation pass.** Walk phases 09–30, check the boxes that are
   genuinely done, and mark the rest honestly. Where a phase shipped in a form
   the plan did not anticipate (Xtream VOD's ad-hoc persistence, §4.6), record
   *what was actually built* next to the task rather than silently ticking it.
2. **Add a `> Status:` line** to each phase file (`not-started` / `partial` /
   `shipped` / `superseded`) and generate a summary table into
   `MASTERPLAN.md` via a script, the same way `masterplan/reference/state-keys.md`
   is already generated. A derived table cannot rot in one direction while the
   source rots in the other.

Also update `CLAUDE.md`: it currently tells agents the phase files are the
build-order source of truth. Until U5 lands, that instruction is actively
harmful and should carry a warning.

### U6. Map the shadow state layer
**Closes §4.4, and is a precondition for U7.**

~40 module-scope `let` singletons are real application state with no registry,
no inspector, and no reset. Minimum viable fix:

1. **A `resetModuleState()` export per module holding singletons**, and a
   single `src/state/reset.ts` that calls all of them. Wire it into a Vitest
   `beforeEach` global setup — this alone closes §4.3's flake class permanently
   and cheaply.
2. **A `MODULE_STATE` section in `src/state/README.md`**, listing every
   singleton, its owner, and why it is not a Spektrum key. Same discipline as
   `KEY_REGISTRY`, applied to the half of the state that currently has no map.
3. **Extend `__tl.dumpState()`** to include the module-state snapshot, so a dev
   reproducing a bug sees all the state rather than half of it.

### U7. Eliminate the flake at its root
**Closes §4.3. — ✅ LANDED, and this plan had the cause wrong.**

The diagnosis here ("scope the single-flight guard") described a real smell but
not this bug. `runImport`'s `finally` always clears `active`, so the guard was
never the leak. The actual cause was `@vitest/web-worker`'s shared module
cache, papered over by hand-tuned 10 ms / 50 ms sleeps that held in isolation
and lost under full-suite load — the specs' own comments described the race
accurately; the margins were simply too small.

Two changes, and both were needed:
- One shared `settleWorkerModuleCache()` (`src/shared/testing/worker-settle.ts`)
  replaces three separate magic numbers across two spec files, with a margin
  set far above the race window rather than tuned close to it.
- `import-run.spec.ts` drains the module-scope guard in `afterEach`. This is
  what stops **one** racing test from cascading into "already in flight" for
  every later test in the file — which is why the failure always appeared as
  five at once, and why the 23% figure overstated how often the underlying
  race actually fired.

11 consecutive clean full-suite runs since. The original suggestion below
still stands as the deeper cleanup:

Measured at **3 red runs in 13** (~23%). Every red run costs someone a re-run
and erodes trust in CI, and it will eventually mask a real regression.

**Today (Tier 0, one line):** add `beforeEach(cancelImport)` to
`import-run.spec.ts`. A stopgap, not a fix, but a ~23% flake does not deserve
to wait for the proper change.

**Properly:** stop `runImport`'s single-flight guard being ambient module
state — return a disposable `ImportSession` handle from `runImport()`, with
`active` scoped to it. The same treatment applies to the seven other
`inFlight` / `busy` booleans (`vod.actions`, `series.actions`, `vod-warm`,
`series-warm`, `xtream-refresh`, `xtream.actions`, `import-triggers`), and
U6's reset hook closes the residual class.

---

## Tier 2 — Close the architectural scars

### U8. Break up `index.html`
**Closes §4.8.**

1. Extract the SVG sprite to `public/icons.svg` and reference it externally —
   removes ~6 KB from the critical path immediately, cached separately.
2. Split view markup into `src/views/*.html` partials, composed at build time
   via a small Vite plugin (or `vite-plugin-html`'s include support). Ship the
   shell plus the active view; defer settings, wizard, and debug panel.
3. **Add a markup-size fence** to `check-css.mjs`'s sibling — cap each partial
   at 400 lines, matching the TypeScript ceiling. The asymmetry between a
   hard-capped `.ts` and an unlimited `.html` is what created this file.

### U9. Give catalogs a real storage table
**Closes §4.6's largest scar.**

Add `vodCatalog` / `seriesCatalog` to `TableName` and `TableRowMap` in
`src/core/storage/records.ts`, and move `catalog-storage.ts` onto the bulk-table
surface. This restores the versioning envelope, the migration hooks, and tier
behavior below `'full'` — all three of which VOD/series currently forgo purely
because a phase mandate said "`src/state/` only."

Then delete the 25-line apology comment at the top of `catalog-storage.ts`.

### U10. Finish the vod/series factoring
**Closes §4.9.**

`catalog-warm` / `catalog-memory` / `catalog-storage` / `catalog-sort` already
prove the parameterized-core pattern. Extend it to the two remaining pairs:

```ts
// src/state/catalog-actions.ts
export function createCatalogActions<TItem, TDetail>(config: CatalogConfig<TItem, TDetail>) {
    return { open, selectCategory, openDetail, closeDetail };
}
// vod.actions.ts / series.actions.ts become ~40-line config + wiring files.
```

Expected reduction: ~400 LOC, and — more valuable — one place to fix a catalog
bug instead of two, with no risk of fixing only one.

### U11. Make `replace()` unnecessary rather than remembered
**Closes §4.5.**

The deep-merge hazard is currently prevented by a README paragraph asking
future authors to remember. Convert it to a gate: add `mapShaped: true` to the
`KeyMeta` of every `Record<string, T>` key in `KEY_REGISTRY`, and make
`typed.ts`'s `set()` **throw in dev** when called with an object value on a
`mapShaped` key. The correct call (`replace()`) then becomes the only one that
compiles-and-runs, and the next author cannot reintroduce the bug by
forgetting a README.

### U12. Add a CSP and constrain the CDN load
**Closes §4.7.**

1. **CSP** as a `<meta http-equiv="Content-Security-Policy">` in `index.html`
   and a `session.defaultSession.webRequest.onHeadersReceived` header in
   `desktop/main.mjs`. Start in report-only to find the violations, then
   enforce. `img-src` must permit arbitrary remote logo hosts; `script-src` can
   be tight.
2. **Default the web target to the vendored Spektrum copy**, which
   `package-target.mjs` already does for packaged builds. Import maps cannot
   carry `integrity`, so a same-origin vendored load is the only way to get an
   enforceable guarantee — and the file is 13.6 kB, already in `public/vendor/`,
   already SHA-384-verified at build time. The CDN buys nothing here.

---

## Tier 3 — Make the product whole

### U13. Ship the offline shell
**Closes §4.11 (PWA), unblocks Phase 24.**

A manifest without a service worker is an install prompt that leads to a blank
page on a bad connection. The shell, the vendored Spektrum, and the CSS are all
static and pinned — precisely the easy case. Include the kill-switch and update
flow Phase 24 already specifies.

### U14. Build the input model the TV target requires
**Closes §4.11 (a11y), unblocks Phase 30.**

webOS is a stated 1.0 target and there is currently no spatial navigation, so
the TV target has no viable input story at all. This is the largest *unstarted*
gap in the plan and should be sequenced before, not after, packaging work:
global roving tabindex, a documented D-pad key map, focus containment in the
settings/wizard dialogs, and `aria-selected` / `aria-pressed` coverage across
the list and rail.

### U15. Runtime i18n fallback
**Closes §4.11 (i18n).**

`strings.spec.ts` guarantees key parity at build time; a `Proxy`-based
`getStrings()` that falls through to `en` on a missing leaf guarantees the user
never sees `undefined` if that guarantee is ever bypassed. ~15 lines.

### U16. Decide the visualizer's place deliberately
**Closes §4.10.**

The 2,042-LOC visualizer is off-plan, not bad. Two actions:
- **Lazy-load it** behind the Radio view (feeds U4's budget directly — it is
  dead weight for every user who never opens Radio).
- **Give it a phase file.** It is a real feature with real scope; leaving the
  largest single module in the app absent from the plan is how §3.2 happens
  again. Retroactive documentation is cheap; an unmapped 2,000-LOC subsystem is
  not.

---

## Sequencing

| Wave | Items | Outcome |
| --- | --- | --- |
| **1 — this week** | U1, U3, U7 (interim), U5 | Green CI means something. The map matches the territory. |
| **2 — next** | U2, U4, U6, U8 | The app has no unreachable features and no unmapped state. Budget enforced. |
| **3** | U9, U10, U11, U12 | Architectural scars closed; hazards gated instead of remembered. |
| **4** | U13, U14, U15, U16 | Product whole enough that Phase 30's TV target is actually reachable. |

**The one-line version:** U1 and U3 are ~2 hours of work combined and would have
prevented the two critical findings in this audit outright. Do those first.
