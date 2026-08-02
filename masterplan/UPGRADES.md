# ThunderTV — Upgrade Plan

> The remediation companion to [`AUDIT.md`](./AUDIT.md). Every item names the
> finding it closes, the concrete change, and the check that keeps it closed.
>
> Ordered by **leverage**, not by effort. U1–U4 are the ones that stop the
> bleeding; everything after is compounding improvement.
>
> **Status:** U1, U2, U3, U4, U5, U7, U10 and U11 have landed; U8 is fenced
> but not split; U12, U14, U15 and U16 are partly closed by work that arrived
> for other reasons. What they actually
> cost and what they bought is recorded inline below, so the next person can
> judge the remaining items against real numbers rather than my estimates.

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

> #### The fence had a hole — found while landing U5, closed by `becff80`
>
> Briefly, `check-dist.mjs` measured **the entry chunk only** while the page
> modulepreloaded three more, so the real first-load payload was 77.3 kB gz
> against a 60 kB budget reporting green. `platform-*.js` alone was larger
> than the chunk being policed. Same defect class as U3 (a guard that existed
> but never ran), one level in — a guard that runs but measures the wrong
> thing, which is worse, because a passing check is read as evidence.
>
> The v1.0.0 pass rewrote it. `check-dist` now sums **every eager script** —
> entry, all module preloads, Spektrum and its CSP registry — and adds HTML,
> CSS, total-shell-text and install-footprint budgets, all re-baselined for
> the webOS 6 / Chromium 87 floor and documented with their rationale in
> `webos/PERFORMANCE-BUDGET.md`. Non-JS assets are covered by the install
> budget, which is what finally weighs the 1.85 MB boot wallpaper (total
> 4.39 MiB against 10 MiB).
>
> **What the budget move does and does not mean.** Eager JS is now measured
> at 92.3 KiB gz against a 100 KiB ceiling — not 60. That is a deliberate,
> documented re-baseline to a TV support floor, not a quiet relaxation, and
> it is the honest number where 60 never was. But the headroom is 8%, and the
> one structural fix that would buy real room — U8's `index.html` split — is
> still open. Read "passing" here as "measured," not "comfortable."
>
> **The fix is small — sum every `<script>`/`modulepreload` chunk in
> `dist/index.html` instead of picking the entry — but it lands `verify`
> red at 77.3/60**, so it is a deliberate call, not a drive-by: either
> take the failing gate now with a recorded TODO (this document's own
> advice, above) or split `platform-*.js` first and land the fence green.
> Flagging rather than choosing, since it blocks every `verify` until the
> gap closes.

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
**Closes §3.2. — ✅ LANDED**

Every phase file now carries a machine-parsed status line:

```
> **Status:** `<shipped|partial|not-started|superseded>` · tracker: `<current|not-maintained>` — <prose>
```

`scripts/gen-phase-status.mjs` renders those into MASTERPLAN §4's table and
runs in `--check` mode as `npm run lint:phase-status`, inside `verify` — so
the summary can no longer rot in one direction while the phase files rot in
the other. `gen-state-keys.mjs --check` got wired into `verify` at the same
time; it was **already failing**, which is the second time in this document
that a written-but-unrun guard turned out to be guarding nothing.

The reconciliation found more than a stale tracker. Six phases are not what
the plan says they are: **09, 12, 13, 15, 23, 26** shipped partially, with
named gaps (no `/` shortcut or match highlighting; no theater mode or volume
control; no favorites ordering or orphan reconciliation; no conditional GET
on playlist refresh; no global error boundary; no startup instrumentation).
**16, 17 and 18 were superseded** by Phases 31/32 rather than completed —
`src/epg/README.md` had recorded that at the point of use, and the masterplan
never heard about it. **14 and 24 are genuinely unstarted.**

**The one judgment call:** the plan said "check the boxes that are genuinely
done." I did not retro-tick ~2 000 boxes across 22 phases, because verifying
them individually is not something this pass could honestly claim to have
done, and a wrong tick is indistinguishable from a right one afterwards. The
phase-level status line is verified and the box counts for those files are
reported as *not tracked* rather than as a number nobody stands behind.
Trading false precision for stated ignorance is the whole point of the
exercise; if per-task fidelity is wanted for a specific phase, reconcile that
one file and flip its tracker back to `current`.

`CLAUDE.md` now points at the status table and says plainly that the module
README, not the phase file, is the live reference.

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
**Closes §4.8. — 🟡 FENCED, not yet split (step 3 landed; steps 1–2 open).**

Step 3 — the load-bearing part, per this item's own argument — is done:
`scripts/check-markup.mjs` caps `index.html` at its current 3,591 lines /
246,284 bytes and runs in `verify` as `lint:markup`. It is a ratchet, so the
file can shrink and can never grow; lower the cap in the same commit that
shrinks it.

Deliberately capped at today's size rather than the 400-line TypeScript
ceiling: the latter would land `verify` red with no way to green it short of
doing steps 1–2, and a permanently-red gate teaches everyone to skip the
gate. The sprite extraction and the partials split are still open, and now
have a number that can only move one way while they wait.

Re-measured while landing U5:

| | At the audit | Now | Change |
| --- | --- | --- | --- |
| Lines | 2,366 | **3,560** | +50% |
| Shipped `dist/index.html` gz | 21.79 kB | **32.5 kB** | +49% |
| Entry chunk gz | 71.75 kB | 46.0 → **33.7 kB** | −53% |

The contrast is the finding. The entry chunk got *better* by half, because U4
put a fence around it and `verify` fails when it is breached. `index.html`
grew by half over the same period, because nothing measures it — it is now
**larger, gzipped, than the entry chunk it sits next to**, and every byte is
on the critical path. This is §5's "nothing is measured, so nothing holds"
running its course a second time, in the one place the first round of fences
did not reach.

Step 3 below is therefore the load-bearing part, not the cleanup at the end:
land the fence first, even at today's size, so the number can only go down.

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
**Closes §4.9. — ✅ LANDED**

`src/state/catalog-actions.ts`'s `createCatalogActions()` now owns the browse
flow — open, publish categories, select category, republish rows — and
`vod.actions.ts`/`series.actions.ts` pass a config. Detail and playback stay
per-catalog on purpose: a movie's detail is one flat `get_vod_info` snapshot,
a series' is a seasons/episodes tree with its own status key, error reason
and a fetch shared with episode playback.

**The LOC estimate below was wrong, and worth recording as such.** 715 lines
across two files became 742 across three: the ~160 lines of duplicated
cascade logic do collapse to one copy, and the config plumbing plus the new
module's own documentation spend that back. The second half of the estimate —
one place to fix a catalog bug instead of two — is the part that actually
paid, and was always the real reason.

Two things fell out of it. The catalog instance is built lazily rather than
at module scope, because the factory reads `vod-rows`/`series-rows`
singletons and running it during module evaluation loses a race with the
`src/state/` import cycle. And the in-flight guard and sequence tokens became
per-instance closures instead of the module-level `let`s §4.4 counted — a
small down payment on U6.

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
**Closes §4.5. — ✅ LANDED**

`KeyMeta` gained `mapShaped`, four keys carry it (`ui.listState`,
`favorites.ids`, `vod.detail`, `series.detail`), and `typed.ts`'s `set()`
throws in dev on a plain-object write to one of them, naming `replace()`.
All four already used `replace()`, so nothing changed behaviour — the full
`src/state` suite passing with the gate live is also the sweep that proves no
call site was getting it wrong.

**One design note the plan below did not anticipate.** The check cannot read
`KEY_REGISTRY`: `typed.ts` is imported by every state module, and
`registry-keys.ts` imports each key's *name* back from the module that owns
it, so the registry answers differently depending on which module the process
loaded first. The key set therefore lives as a literal in
`map-shaped-keys.ts`, which imports nothing, and `map-shaped-keys.spec.ts`
fails if it and the registry's `mapShaped` flags ever disagree.

That import cycle is worth knowing about independently: with `./favorites`
loaded before `./registry`, `FAVORITES_IDS` is still uninitialized when
`registry-keys.ts` builds its table, both favorites entries collapse onto one
`"undefined"` key, and `KEY_REGISTRY` comes out with 116 entries instead of
117. Harmless today (both keys are `persisted: false`, so only
`assertCompact`'s per-key ceiling silently degrades) but it is a live trap for
the next persisted key added to that module. Unowned by any item here yet.

The deep-merge hazard is currently prevented by a README paragraph asking
future authors to remember. Convert it to a gate: add `mapShaped: true` to the
`KeyMeta` of every `Record<string, T>` key in `KEY_REGISTRY`, and make
`typed.ts`'s `set()` **throw in dev** when called with an object value on a
`mapShaped` key. The correct call (`replace()`) then becomes the only one that
compiles-and-runs, and the next author cannot reintroduce the bug by
forgetting a README.

### U12. Add a CSP and constrain the CDN load
**Closes §4.7. — 🟡 MOSTLY LANDED in the v1.0.0 pass (`becff80`)**

Both halves of point 2 and the web half of point 1 are done:

- **The CDN is gone.** The import map resolves `spektrum` to
  `./vendor/spektrum.min.js` on the *web* target too, not just packaged
  builds — so the SHA-384 that `check-importmap.mjs` verifies at build time
  now constrains what the browser actually fetches, which was the whole
  problem. `check-importmap` reports "Spektrum 1.1.0 is local."
- **A strict CSP ships in `index.html`**, enforced rather than report-only,
  and it went further than this item asked: Spektrum's `{{expr}}` bindings
  are **precompiled** at build time (`scripts/spektrum-csp.mjs` →
  `src/app/spektrum-csp.ts`, 717 expressions) so the runtime needs no
  `eval`/`new Function` and `script-src` can stay tight. `npm run lint:csp`
  verifies the policy and the registry together.

**Still open: the Electron half.** `desktop/main.mjs` has no
`session.defaultSession.webRequest.onHeadersReceived` CSP header — the
packaged app relies on its `file://` origin and hardened `webPreferences`
alone. Lower risk than the web target was (no CDN, no remote script), but it
is the one part of this item not yet done.

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
**Closes §4.11 (a11y), unblocks Phase 30. — 🟡 MOSTLY LANDED, as Phase 35**

The core of this item shipped, and in a better form than proposed here.
`src/ui/spatial/` decides focus by **geometry** — "which element is actually
to the right of this one" — rather than by the global roving tabindex
suggested below. That matters because a tab ring is one ordered list authored
into the markup, which has to be hand-maintained per screen and still sends
the cursor somewhere unrelated on a 10-foot layout; geometry stays correct
however the layout reflows, with no per-screen authoring. `keys.ts` covers
the documented D-pad map across desktop and TV webviews, including the Back
button.

**Still open:** focus containment in the settings/wizard dialogs, and
`aria-selected`/`aria-pressed` coverage across the list and rail — §4.11's
count of 1 `aria-pressed` and 2 `aria-selected` app-wide has not meaningfully
moved.

### U15. Runtime i18n fallback
**Closes §4.11 (i18n). — 🟡 PARTLY LANDED**

The *locale* fallback exists: `nl`/`de` now load as their own chunks (a
by-product of U4's budget work, which found all three dictionaries were
~44 kB of the entry chunk), and a failed import falls back to `en` rather
than rejecting, so a language switch can never blank the UI.

**Still open — the actual finding.** That covers a failed *dictionary*, not a
missing *leaf*. There is no `Proxy` in `strings.ts`, so a key present in `en`
and absent from `nl` still renders `undefined` at runtime; `strings.spec.ts`'s
build-time parity assertion remains the only thing preventing it. ~15 lines,
unchanged.

### U16. Decide the visualizer's place deliberately
**Closes §4.10. — 🟡 HALF LANDED**

- **Lazy-loading: done.** `src/player/visualizer-lazy.ts` defers the whole
  subsystem behind the Radio view, and it is part of why U4's budget closed.
- **A phase file: still missing.** The visualizer appears in zero phase files
  and zero module READMEs' ownership lines. It remains the largest single
  subsystem the plan does not mention — and now that §4 has a status table,
  it is the one thing that table cannot see. Same failure mode as §3.2, one
  subsystem instead of 22 phases.

---

## Sequencing

| Wave | Items | Outcome | State |
| --- | --- | --- | --- |
| **1** | U1, U3, U7, U5 | Green CI means something. The map matches the territory. | ✅ done |
| **2** | U2, U4, U6, U8 | The app has no unreachable features and no unmapped state. Budget enforced. | U2, U4 done; U8 fenced; **U6 open** |
| **3** | U9, U10, U11, U12 | Architectural scars closed; hazards gated instead of remembered. | U10, U11 done; U12 mostly; **U9 open** |
| **4** | U13, U14, U15, U16 | Product whole enough that Phase 30's TV target is actually reachable. | U14/U15/U16 partly done; **U13 untouched** |

**Where this stands now.** Wave 1 is closed, wave 3 is nearly closed, and the
two critical findings are gated rather than remembered.

`index.html` stopped getting worse: U8's step 3 landed a ratchet, so the file
that grew 2,366 → 3,591 lines unmeasured can now only shrink. The split
itself is still open, but it is no longer a race against the file.

What is actually left, in order:

- **U6 is now the one still costing something daily**, and the only wave-2
  item open. The shadow state layer has no reset hook, which is why §4.3's
  flake class is suppressed rather than eliminated. U10 made a small down
  payment by turning the catalogs' in-flight guards into per-instance
  closures; the other ~40 singletons are untouched.
- **U9** (catalogs on the bulk-table surface) is the last wave-3 scar, plus
  U12's Electron CSP header.
- **U13 is the largest product gap left**, and the one item here nobody has
  touched at all: Phase 24 remains a manifest with no service worker.

**The one-line version:** U6 first, because it makes the test suite honest;
then U13; then U8's actual split, now that its number can only go down.
