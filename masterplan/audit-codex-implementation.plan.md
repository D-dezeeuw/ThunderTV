# Codex audit — implementation plan

> The remediation companion to
> [`.claude/context/project-audit-codex.md`](../.claude/context/project-audit-codex.md)
> (2026-07-31, self-scored 8.88/10), in the same spirit as
> [`UPGRADES.md`](./UPGRADES.md) is to [`AUDIT.md`](./AUDIT.md). Every audit
> recommendation was verified against the working tree before being accepted
> here; verdicts below say what the verification actually found, not what the
> audit claims.
>
> **Status: planned.** Items I1–I6 are described to be directly executable —
> file paths, wiring points, and test lists are verified against the tree as
> of `b1d5190` — but none have been implemented yet.

## How the audit held up

Factually, well: every checkable claim was confirmed, several turned out to
be *understated* (the redaction gap, the boot-task gap), and exactly one is
contradicted by evidence — the audit calls the `@openai/codex` desktop
dependency "an existing user change … deliberately preserved," but
`git log -S '@openai/codex'` shows it was introduced by the audit pass's own
commit (`becff80`) and no earlier commit ever touched it.

Strategically, the audit mostly rediscovers what `UPGRADES.md` already
tracks with sharper internal diagnosis: its index.html concern is **U8**, the
VOD/Series twins are **U10**, module lifecycle is **U6**, replace-vs-merge is
**U11**, and the masterplan reconciliation it asks for is **U5 — already
landed**. So this plan does not "implement the audit"; it lets the audit
re-prioritize the existing backlog, and rejects the recommendations that
conflict with this repository's own rules.

## Verdicts

| Audit point | Verdict | Disposition |
| --- | --- | --- |
| Remove `@openai/codex` desktop dep | Holds — stronger than stated: sole production dep, unused, bundled into installers by electron-builder, added by the audit commit itself | **Do — I1** |
| Central diagnostic redaction | Holds — worse than stated: five unshared implementations (two both named `redactUrl` with different logic), and `src/state/debug.ts` — the on-screen console with copy-to-clipboard — redacts nothing | **Do — I2** |
| Supervise boot tasks | Holds — concrete bug found: a rejected `sweepAndLoadPlaylistSources()` leaves the splash mounted forever; 10 bare `void`s, zero `.catch` | **Do — I3** |
| Replacement-semantics API (U11) / module disposal (U6) | Gate holds and is small; disposal is a real design effort the audit itself defers to "before the next major feature cycle" | **Do U11 — I4; defer U6** |
| Factor VOD/Series twins (U10) | Holds — ~1,400 duplicated lines across 4 twin pairs in `src/state/`, isomorphic exports, comments admit it | **Do — I6** |
| Split `index.html` into partials (U8) | The problem holds (3,591 lines, all views inline, only major artifact with no size fence); the split is not the next step — U8's own analysis says fence first | **Do fence only — I5; defer split** |
| Reconcile the masterplan | Mostly already landed as U5 (status lines, generated §4 table, `--check` gate, CLAUDE.md pointer); what remains is that the "read Status, not checkboxes" warning sits at line ~186, past where a skimmer stops | **Do top-banner nit — I1** |
| Playwright real-browser suite | Real gap (Phase 27.6 is the named blocker for boxes 02.10.9, 07.5.10, 07.10.7) but conflicts with repo posture | **Skip for v1** — see below |
| Launched-Electron integration test | Real gap, same posture conflict, heavyweight | **Skip** — manual Electron smoke in `RELEASE_CHECKLIST.md` covers v1 |
| Coverage ratchet | Does not hold here — contradicts `.claude/AGENTS.md`'s testing philosophy | **Skip deliberately** |
| Automated axe scans | Partial gap — 6 specs already assert ARIA attributes; axe-in-jsdom can't check contrast/layout, which is most of what's missing | **Skip** — U14's targeted ARIA work is the vehicle |
| Physical webOS smoke | Not a code task — needs hardware | **Skip** — user's manual task, already in `RELEASE_CHECKLIST.md` |
| Desktop packaging smoke + signing decision | Business decision; signing/notarization are deliberately commented-out stubs in `electron-builder.yml` ("no cert budget for v1") | **Skip** — user decision |
| Record the release matrix | `RELEASE_CHECKLIST.md` already exists; "recording" means running the manual smokes and writing down results | **Skip** — nothing to build |

Bonus while in there: `.github/workflows/ci.yml` carries a stale comment
referencing the old "200 kB" startup budget; `check-dist.mjs` now enforces
400 KiB raw / 100 KiB gzip. One-line comment fix, folded into I1.

---

## I1 — Housekeeping: the dependency, the banner, the stale comment

**Effort: trivial. Value: smaller installers, honest docs.**

1. Remove `"@openai/codex": "^0.146.0"` from `desktop/package.json`'s
   `dependencies` (its only entry — the section can go) and regenerate
   `desktop/package-lock.json` (`npm install --prefix desktop`). Nothing
   imports it — verified across `src/`, `desktop/`, `scripts/`, `tests/` —
   and electron-builder bundles production deps, so today it ships six
   platform binaries into every installer for nothing. Anyone using the
   Codex CLI for future audits can install it globally.
2. Add a one-line banner directly under `masterplan/MASTERPLAN.md`'s title:
   *"Read each phase's `> **Status:**` line (and §4's generated table), not
   the checkboxes — boxes across phases 09–30 are stale and report shipped
   work as unstarted."* The full explanation at §4 stays; this just puts the
   warning where a skimmer actually is. (Outside the generated
   `BEGIN generated: phase-status` fence, so `lint:phase-status` is
   unaffected.)
3. Fix the stale "200 kB" budget comment in `.github/workflows/ci.yml` to
   match `check-dist.mjs`'s current 400 KiB raw / 100 KiB gzip eager-JS
   budget.

Gate: `npm run lint:phase-status` still green; `desktop/` installs clean.

## I2 — Centralize credential redaction; make the debug console redact

**Effort: medium. Value: closes a real credential-leak path.**

Today there are five unshared redaction implementations —
`src/core/raw-capture.ts:46` (`redactCredentialFields`, username/password
JSON fields only), `src/xtream/urls.ts:49` (`redactUrl`),
`src/xtream/client.ts:21` (`redactApiUrl`), `src/m3u/import.ts:100`
(`redactPlaylistUrl`), `src/state/config-export.ts:58` (a *different*
`redactUrl`) — plus a sixth credential-param list in
`src/health/stream-key.ts:23`. Meanwhile `src/state/debug.ts` stores and
renders console/error output verbatim, with a copy-to-clipboard action: any
`console.error('fetch failed', url)` carrying an Xtream URL puts plaintext
credentials on screen.

**New `src/core/redact.ts`** (core layer, imports nothing):

- `CREDENTIAL_PARAMS: ReadonlySet<string>` — the one credential-param list
  (`username, user, password, pass, token, auth, key`), compared lowercased.
- `redactUrl(url: string): string` — parse-based, for values that *are*
  URLs: strips userinfo, sets present credential params to `REDACTED`
  case-insensitively, rewrites Xtream `/live|movie|series/{user}/{pass}/`
  path segments, returns `[unparseable url redacted]` on parse failure.
  Body is the union of today's `m3u/import.ts` + `config-export.ts`
  implementations with the widened param list.
- `redactText(text: string): string` — regex sweep for free text that may
  *contain* URLs or stringified objects; never throws. Four passes:
  `[?&]param=` values, the Xtream path shape, `scheme://user:pass@`
  userinfo, and quoted JSON credential fields.
- `redactJsonCredentialFields(body: string): string` — moved verbatim from
  `raw-capture.ts`. Deliberately narrow (username/password JSON fields only)
  so captured provider bodies stay otherwise byte-identical — do not widen.

**Call sites become thin delegates, public names kept:**

| File | Change |
| --- | --- |
| `src/core/raw-capture.ts` | delete local fn; import `redactJsonCredentialFields` from `./redact` |
| `src/xtream/urls.ts` | `export { redactUrl } from '../core/redact';` (output token changes `***` → `REDACTED` — update `urls.spec.ts` expectations only) |
| `src/xtream/client.ts` | `redactApiUrl` keeps its signature, body becomes `redactUrl(apiUrl(source, action, ''))` |
| `src/m3u/import.ts` | `export const redactPlaylistUrl = redactUrl;` |
| `src/state/config-export.ts` | keep the null-tolerant wrapper (export contract), delegate the string case |
| `src/health/stream-key.ts` | import the shared `CREDENTIAL_PARAMS`; **everything else untouched** — `streamKey()` is a persisted identity fingerprint, not display redaction; changing its `*` mask/sorting/null semantics would orphan stored health records |

**Debug wiring — one choke point:** apply `redactText()` inside `debug.ts`'s
`push()` (~line 81), before the entry is stored. That covers all ingress
(three console wrappers, `window 'error'`, `unhandledrejection`) and all
egress (panel render, `debugReportText()`, clipboard copy) at once.
Redacting after `stringify()`'s 500-char cap is safe — the sweep regexes
don't need a terminator, so a truncated `password=abc…` still matches.

**Tests** (quick-test norm): new `src/core/redact.spec.ts` (~7 cases:
mixed-case params incl. `token`/`auth`/`key`; userinfo; `/live/` and
`/movie/` path shapes; unparseable → placeholder; credential-free URL
byte-identical; `redactText` on a sentence containing an Xtream URL; JSON
`"pass"` field). One leak-regression case in `src/state/debug.spec.ts`
(credentialed URL through `console.error` → entry contains `REDACTED`, not
the secret). Update `urls.spec.ts` expectations; `client.spec.ts`,
`import.spec.ts`, `config-export.spec.ts` must pass **unchanged** — a
failure there is a design regression, not a spec to edit. Add a `redact.ts`
bullet to `src/core/README.md`.

## I3 — Boot-task supervision, and the splash that can never exit

**Effort: small. Value: removes a permanent-hang failure mode.**

`src/app/bootstrap.ts` fires ten background tasks with bare `void` (lines
~103–147) — zero `.catch`. Two concrete hang paths:

1. `src/state/boot.ts:84-92` — `manageBootOverlay()` derives `readiness`
   from `sweepAndLoadPlaylistSources()`; if that rejects, `beginBootExit()`
   never runs, `ui.bootPhase` stays `'loading'`, and the splash
   (`data-if="ui.bootPhase !== 'done'"`) never unmounts. **Fix:** append a
   `.catch` to the `readiness` chain that logs via `console.error` (captured
   by the debug panel — `installDebugCapture()` runs first) and lets the
   splash exit.
2. `src/ui/list-bindings.ts:96-99` — on a configured install the splash also
   waits on `channelDataReady`, resolved only via `onInitialLoad` in a bare
   `.then` after `loadActiveSource()`. **Fix:** reorder to
   `loadActiveSource().catch(log).then(() => { void consumeHandoff(); onInitialLoad?.(); })`
   so readiness always fires.

**Supervisor** — bootstrap.ts-local, ~8 lines, exported only for its spec
(mirrors `sweepAndLoadPlaylistSources`'s existing pattern):

```ts
export function supervise(name: string, task: () => Promise<unknown>): void {
    try {
        void task().catch((error: unknown) => { console.warn(`[ThunderTV] boot task "${name}" failed`, error); });
    } catch (error) {
        console.warn(`[ThunderTV] boot task "${name}" failed`, error);
    }
}
```

Route the ten `void` sites through it with stable names
(`'boot-overlay'`, `'favorites'`, `'epg-mapping'`, …), keeping their
explanatory comments. Factory form preserves synchronous start order and
catches sync throws. Deliberately **no** outcome state key — `console.warn`
already lands in the debug panel; registry ceremony would buy nothing.

**Tests:** one `boot.spec.ts` case (rejected sources promise → advance fake
timers → `bootPhase === 'done'`, `console.error` stubbed and called); three
`bootstrap.spec.ts` cases for `supervise()` (rejecting warns without
throwing; sync-throwing warns; resolving never warns). The list-bindings
reorder is a one-line chain change covered by review.

## I4 — The `mapShaped` gate (UPGRADES U11)

**Effort: small. Value: converts a README rule into a machine gate.**

Spektrum's `setValue` deep-merges object values; the sanctioned removal path
is `replace()` in `src/state/typed.ts`, enforced today only by
`src/state/README.md:595`. Per U11:

- `KeyMeta` in `src/state/registry-keys.ts` gains `mapShaped?: boolean`.
- Mark exactly four keys — all already replace-only, so zero call-site
  conversions: `ui.listState`, `favorites.ids` (registry-keys.ts),
  `vod.detail`, `series.detail` (registry-overflow.ts). Not marked:
  `live.stats` / `search.resultCounts` (fixed structs, merge harmless).
- `isMapShapedKey()` added to `src/state/registry.ts`.
- `typed.ts`'s `set()` throws under `import.meta.env.DEV` (the established
  dev-flag pattern; true under Vitest) when a plain object (not
  null/array/scalar) is written to a marked key, with a message naming
  `replace()`. `replace()` itself calls `spektrumSetValue` directly, so it
  can't trip its own gate. Not placed in `bulk-policy.ts`, whose documented
  contract is "never throws."

**Tests:** four `typed.spec.ts` cases (object on marked key throws;
`replace()` doesn't; unregistered key doesn't; null doesn't) + one
`registry.spec.ts` case. `node scripts/gen-state-keys.mjs --check` must stay
green (no regeneration needed — the generator ignores the new field). Update
the README merge-hazard closing paragraph, and mark U11 landed in
`UPGRADES.md` (heading + Wave-3 row) when this ships. The full `src/state`
suite runs with DEV true, so it doubles as the sweep for any hidden
`set()`-on-map call site.

## I5 — An `index.html` size fence (U8's load-bearing step)

**Effort: small. Value: stops the worst-trending number in the repo.**

`index.html` is 3,591 lines / 240 KiB — every view inline, and per U8 it
grew 50% in one audit-to-audit window precisely because it is the only major
artifact with no fence. The full partials split (U8 steps 1–2) is a real
build-infrastructure effort with regression risk across every view; the
audit's own internal companion says land the fence first so the number can
only go down. So: a small check script (sibling of `check-css.mjs`) capping
`index.html` at its current line count and raw size, wired into `verify` as
`lint:markup`. Ratchet the cap down whenever the file shrinks. The partials
split stays deferred to a dedicated U8 effort.

Gate: `npm run verify` green at the current size; the check fails on growth.

## I6 — Factor the VOD/Series twins (UPGRADES U10)

**Effort: medium, mechanical. Value: ~400 LOC gone; one place to fix
catalog bugs.**

Four twin pairs in `src/state/` (~1,400 lines) with 1:1 isomorphic exports:
`vod.actions.ts`/`series.actions.ts` (361/354 lines — `openVodCatalog` and
`openSeriesCatalog` are structurally line-for-line identical),
`vod-rows.ts`/`series-rows.ts`, `vod.ts`/`series.ts`,
`vod-warm.ts`/`series-warm.ts`. The parameterized-core pattern is already
proven by `catalog-warm` / `catalog-memory` / `catalog-storage` /
`catalog-sort`. Per U10's sketch: a `createCatalogActions<TItem, TDetail>(config)`
in `src/state/catalog-actions.ts`; the twins shrink to config + wiring.

Constraints: keep every exported symbol name and every `defineFn` action
name unchanged (the reachability gate and `index.html`'s `data-fn` bindings
depend on them); series keeps its genuine asymmetry (`fetchSeriesInfo`,
seasons/episodes, `src/xtream/series-coerce.ts`) inside its config. The
mirrored spec files consolidate the shared behavior into one
parameterized spec, keeping per-catalog specs only for the asymmetric parts.

Gate: full `src/state` suite + `npm run lint:reachability`.

---

## Skipped, and why

- **Playwright suite (skip for v1, user decision 2026-08-01).** The gap is
  real — Phase 27.6 names it as the blocker for three deferred checkboxes —
  but this repo deliberately blocks browser verification in agent sessions
  (`.claude/hooks/block-browser-verification.sh`), runs CI tag/manual-only
  for cost, and `.claude/AGENTS.md` warns against suites nobody runs. The
  manual browser smoke in `RELEASE_CHECKLIST.md` covers the same ground for
  a v1 release. Revisit when Phase 27 resumes.
- **Launched-Electron integration test.** Same posture conflict, heavier;
  `RELEASE_CHECKLIST.md`'s manual Electron smoke (sandbox, proxy, download
  cancellation) is the v1 evidence.
- **Coverage ratchet.** Rejected on principle, not deferred:
  `.claude/AGENTS.md` — "thousands of tests nobody reads is the failure
  mode, not the goal." The repo's ratchets guard budgets and invariants
  instead, which is working (see U3/U4's history).
- **Automated axe scans.** Six specs already assert ARIA attributes and the
  spatial-navigation suite covers focus behavior; axe-in-jsdom cannot check
  contrast or layout, which is most of the remaining risk. U14's targeted
  ARIA coverage (`aria-selected`/`aria-pressed` across list and rail) is the
  better next step, on its own schedule.
- **Physical webOS smoke, desktop packaging smoke, signing/notarization.**
  Hardware and business decisions, not code. `RELEASE_CHECKLIST.md` already
  itemizes them; signing is a deliberate commented-out stub in
  `electron-builder.yml` pending an audience decision.
- **"Record the release matrix."** The checklist exists; recording results
  is the act of running it.

## Sequencing

I1 → I2 → I3 → I4 → I5 → I6: cheapest and highest-certainty first, the
mechanical refactor last. Each item is its own branch → implement → quick
unit test → `npm run typecheck` + targeted specs → merge to main, per
`.claude/AGENTS.md`; I5 and I6 end with the fuller gates named above. The
items are independent — any can be dropped or reordered without unblocking
the others.
