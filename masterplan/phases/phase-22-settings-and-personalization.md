# Phase 22 — Settings & Personalization

> **Epic goal:** Every preference lives in one calm four-section settings panel — User, Streaming, Playback, Appearance — with each control writing through the action layer into the persistence bridge, a redaction-safe JSON import/export behind an explicit consent step, and every UI literal locked into the central strings module.
> **Verification:** All four sections operate keyboard-only and every control writes through a `defineFn` setter into the persistence bridge; the schema-driven round-trip mutates every persisted key and survives reload on the full and partial tiers across the storage matrix; the default JSON export contains only placeholder credentials and the consent step is the sole path to including real ones; the strings lint guard fails a fixture containing a hardcoded literal and `npm run lint` is otherwise clean; About shows version, build date, storage tier, budget snapshot, and licenses on built `dist/` with zero network requests; `npm test`, `npm run build`, and `npx tsc --noEmit` are green.

Before this phase, settings exist but grew organically: the Phase 02 panel shell holds controls added wherever phases needed them (the proxy template from 07.8, refresh policy from Phase 15, EPG sources from 16.6, density from Phase 02). After it, the panel has a fixed four-section information architecture, every persisted key is declared once in a schema module with defaults and clamps, controls flow `data-model`/`data-action` → `defineFn` setters → the Phase 05 persistence bridge with boot rehydration before first paint, settings and source definitions round-trip through consent-gated JSON import/export, the strings module is exhaustive and lint-guarded, and About/diagnostics answers the support questions — version, tier, budgets, licenses — without a debugger.

## Feature 22.1 — Settings information architecture

The panel shell from Phase 02 becomes a stable, boring map: four sections in fixed order, one shared field-row layout, every control in its canonical place — calm because nothing about it ever surprises.

- [ ] **22.1.1** Section registry — define `src/app/settings/sections.ts` listing the four sections (id, title key, icon, render partial) in fixed order: User, Streaming, Playback, Appearance.
- [ ] **22.1.2** One open-section value — drive the section nav via `data-each` over the registry and section bodies via `data-if` on a single `settings.section` value; the panel overlays the rail with no hash-route change, per plan §9.
- [ ] **22.1.3** Control migration — move controls added ad-hoc in earlier phases (proxy URL template from 07.8, refresh/staleness policy from Phase 15, EPG sources from 16.6, density from Phase 02) into their canonical sections with persisted keys unchanged.
- [ ] **22.1.4** Shared field row — build one field-row partial (label, control, optional hint line) in `src/ui/views/settings/` reused by every section so the four sections stay visually identical.
- [ ] **22.1.5** Instant open/close — the panel appears and disappears instantly (no transitions); Esc closes it and returns to the previous view state.
- [ ] **22.1.6** Keyboard section nav — ↑/↓ move across the section list and Enter enters a section; verify the whole panel operates pointer-free.
- [ ] **22.1.7** Write-on-change — every control commits immediately through its action; no Save button exists anywhere in the panel, by design (decision note).
- [ ] **22.1.8** Off-screen sections — apply `content-visibility: auto` and `data-if` so only the active section's controls are in the DOM.
- [ ] **22.1.9** File-size split — keep each `src/app/settings/*.ts` module under 300 lines by splitting per section from the start.
- [ ] **22.1.10** IA smoke test — rendered-DOM test asserting all four sections are present in order, migrated controls appear exactly once, and no orphaned control remains at its old location.

## Feature 22.2 — User section

The User section owns the person-shaped preferences: a profile name and how much history the app is allowed to keep — with caps enforced at the action layer so bad input can never reach storage.

- [ ] **22.2.1** Profile name — add a text input bound `data-model="settings.user.name"` committed through `defineFn('setProfileName')`, defaulting empty and used only as a label in exports (Feature 22.7).
- [ ] **22.2.2** Recent-tracking toggle — a checkbox that pauses recording new recent entries while leaving existing ones intact; the hint states exactly that in plain words.
- [ ] **22.2.3** Recent cap — a select (25/50/100, default 100 per the plan §5 `recent ≤ 100` cap) whose action prunes the recent store immediately when lowered.
- [ ] **22.2.4** Zap-history size — a select (10/20/50, default 20 per §6.3's `pushCapped(…, 20)`) applied to `player.zapHistory` with immediate pruning on decrease.
- [ ] **22.2.5** Clear actions — "Clear recent" and "Clear zap history" buttons with an inline confirm step, deleting through `defineFn` actions that also call `persist()`.
- [ ] **22.2.6** Action-layer clamping — clamp every numeric value to its allowed set inside the setter so an out-of-range value never reaches the snapshot.
- [ ] **22.2.7** Partial-tier survival — verify user-section keys ride in the settings snapshot that survives the partial tier (small valuable data).
- [ ] **22.2.8** Dependent-control state — disable (with `aria-disabled` and an explanatory hint) the recent cap and clear-recent controls while recent tracking is off, instead of hiding them.
- [ ] **22.2.9** Strings audit — route every label, hint, and confirm string through strings-module keys under `settings.user.*`.
- [ ] **22.2.10** User-section tests — unit test prune-on-cap-change, the pause-recording toggle, clamping, and the clear-action confirm flow.

## Feature 22.3 — Streaming section

Streaming is where the network lives: the entry point to the sources view, the proxy template, EPG sources, and the refresh policy — consolidated, not duplicated, from the phases that built them.

- [ ] **22.3.1** Sources entry point — an "Open sources" row navigating the hash router to the Phase 15 sources view; the panel itself hosts no playlist CRUD (one owner, per plan §9).
- [ ] **22.3.2** Proxy template canonical home — carry the Phase 07.8 proxy URL template control (validation, `{url}` placeholder, empty-by-default posture) into this section unchanged, persisted keys intact.
- [ ] **22.3.3** Segment-honesty copy — keep the plain-words note that the proxy applies to playlist/EPG/API fetches while video segments remain CORS-bound on the web (§8.3), rendered under the proxy field.
- [ ] **22.3.4** EPG sources block — host the Phase 16.6 global XMLTV source list (add/remove, per-source refresh, last-fetch status) as this section's EPG group.
- [ ] **22.3.5** Refresh policy — a select for the staleness window (manual only / 6 h / 12 h / 24 h) consumed by the Phase 15 conditional-refresh scheduler and the Phase 16.7 EPG staleness check.
- [ ] **22.3.6** Bookmark pointer — a hint row pointing at the per-source "Copy bookmark link" action in the sources view (Phase 14) — referenced here, implemented once there.
- [ ] **22.3.7** Credential display rule — source-related rows in this section render user + host only; stored Xtream passwords never appear in the panel DOM.
- [ ] **22.3.8** Proxy-change revalidation — changing the proxy template clears stored `etag`/`lastModified` validators so the next refresh refetches fully through the new proxy path (decision note).
- [ ] **22.3.9** Persistence check — proxy, refresh policy, and EPG-source definitions persist through the bridge and survive the partial tier as source-definition data.
- [ ] **22.3.10** Streaming-section tests — unit test the refresh-policy consumption seam and the validator-clearing behavior on proxy change.

## Feature 22.4 — Playback section

Playback preferences steer the Phase 10/11 machinery without touching it mid-flight: engine try-order, the episode auto-advance policy, volume memory, and whether mixed-content warnings show.

- [ ] **22.4.1** Engine order control — a reorderable three-item list (hls.js / mpegts.js / native) feeding the Phase 11 fallback chain's try order; URL-type compatibility still filters candidates first.
- [ ] **22.4.2** Keyboard reordering — reorder via focused move-up/move-down actions — no drag-only interaction anywhere in the panel.
- [ ] **22.4.3** Native floor — prevent removing or disabling the native engine (the last-resort fallback), with the constraint explained in the hint line.
- [ ] **22.4.4** Autoplay policy — a select (off — default / auto-advance episodes) flipping the `playback.autoAdvance` value that Phase 21.6.6 left as the gate on the next-episode prompt.
- [ ] **22.4.5** Volume memory toggle — on (default) keeps persisting volume across sessions; off stops persisting and holds volume per session only.
- [ ] **22.4.6** Mixed-content warnings toggle — default on; off suppresses the pre-playback warning surface while detection and diagnostics logging continue unchanged.
- [ ] **22.4.7** Next-start application — engine-order changes apply on the next playback start; the currently playing engine is never hot-swapped (decision note).
- [ ] **22.4.8** Active-engine readout — a read-only line naming the engine currently in use while something plays, derived from one `computed()` — no polling.
- [ ] **22.4.9** Playback keys persisted — all four preferences ride the settings snapshot across the full and partial tiers.
- [ ] **22.4.10** Playback-section tests — unit test order→chain propagation, the `autoAdvance` gate consumption, both volume-memory paths, and the warning-suppression flag.

## Feature 22.5 — Appearance section

Appearance is three switches with big consequences — theme, density, artwork visibility — each applied instantly through tokens and re-published windowing constants, never through per-component styling.

- [ ] **22.5.1** Theme toggle — dark (default) / light switching a `data-theme` attribute on the root element; both palettes live entirely in `tokens.css` custom properties.
- [ ] **22.5.2** Pre-paint theme — apply the stored theme in the `main.ts` boot order before first render so a light-theme user never sees a dark flash (and vice versa).
- [ ] **22.5.3** Density select — compact (32 px) / comfortable (44 px) re-publishing the windowing constants; the channel list and the Phase 21 poster grid both re-anchor to the first visible item after the row-height change.
- [ ] **22.5.4** Artwork visibility — the logo/poster visibility toggle consumed by the 21.8.7 seam and the Phase 08 channel logos: `data-if` removes images, fixed boxes remain, zero reflow.
- [ ] **22.5.5** No-transition guard — add a lint/grep check asserting `transition`/`animation` properties never appear in the stylesheets, so theme and density switches stay instant by construction.
- [ ] **22.5.6** System default — read `prefers-color-scheme` once as the initial default only; an explicit user choice always wins thereafter (decision note).
- [ ] **22.5.7** Contrast spot-check — verify light-palette text/background token pairs against WCAG AA and record measured ratios as comments in `tokens.css` (the full pass comes in Phase 25.7).
- [ ] **22.5.8** Panel self-application — the settings panel itself reflects density immediately (field-row heights), proving the token plumbing end-to-end.
- [ ] **22.5.9** Appearance keys persisted — theme, density, and artwork visibility survive reload on the full and partial tiers via the snapshot.
- [ ] **22.5.10** Appearance tests — unit test density→`ROW_H`/`CARD_ROW_H` propagation, the root-attribute swap, and the boot-order pre-paint application.

## Feature 22.6 — Settings persistence

One schema module is the truth about what persists: every key, type, default, and clamp declared once — consumed identically by boot rehydration, the bridge, the exporter, and the tests.

- [ ] **22.6.1** Settings schema — define `src/app/settings/schema.ts` declaring every persisted settings key with type, default, and clamp/validator — the single registry that rehydration, export, and tests all consume.
- [ ] **22.6.2** Setter pattern — every control commits through a `defineFn` setter that validates via the schema, calls `setValue`, and schedules `persist(key)` per §6.3; templates never persist directly.
- [ ] **22.6.3** Boot rehydration — in the `main.ts` boot order, `storage.getMany` over schema keys before `run()`, applying schema defaults for missing keys so first paint renders final values.
- [ ] **22.6.4** Unknown-key tolerance — ignore unrecognized keys found in storage (logged once through the diagnostics seam) instead of crashing on data written by a newer version.
- [ ] **22.6.5** Debounced batching — settings writes ride the Phase 05 bridge's 500 ms debounced `setMany` batch; no additional timers, no direct storage calls from `src/app/settings/`.
- [ ] **22.6.6** Demotion safety — a quota failure during a settings write follows the §5.7 guarded path: the tier demotes, the in-memory value stays authoritative, the session keeps running.
- [ ] **22.6.7** Snapshot version — stamp a `settingsVersion` into the snapshot on every save, giving future phases a migration hook without a schema change.
- [ ] **22.6.8** Single-tab stance — document last-writer-wins across tabs in the schema docblock as the accepted model (no cross-tab sync in v1); decision note.
- [ ] **22.6.9** Exported defaults — export the schema's default values for reuse by tests, preventing code/spec drift over what "factory settings" means.
- [ ] **22.6.10** Matrix round-trip — the storage-matrix suite mutates every schema key, simulates reload per tier, and asserts equality with each tier's expected survival semantics.

## Feature 22.7 — Import/export JSON

Settings and source definitions travel as one versioned JSON document — never bulk data — and credentials leave the app only after an explicit consent step, redacted by default.

- [ ] **22.7.1** Export document — build `{version, exportedAt, profileName, settings, sources}` from the schema module and source store; channels, EPG programs, and caches are never exported.
- [ ] **22.7.2** Redaction by default — replace Xtream passwords (and any credential-bearing URL userinfo) with a `"__REDACTED__"` placeholder in the default export.
- [ ] **22.7.3** Consent step — an explicit "Include credentials" checkbox with a plain-words warning ("this file then contains passwords — treat it like one") flips inclusion for that export only, never persisting as a preference.
- [ ] **22.7.4** Adapter-routed download — save the file through the platform `FileAdapter` (Blob + object URL on web) so the later Electron native save dialog is an adapter swap, honoring the core fences.
- [ ] **22.7.5** Validated import — parse via the file adapter, validate against the schema (version check, type checks, unknown fields dropped), and show a preview summary (N settings, M sources, credentials present or redacted) before anything applies.
- [ ] **22.7.6** Idempotent source upsert — apply imported sources through `upsertSourceFromImport`/`makeSourceKey` (Phase 07.7) so importing the same file twice yields the same source list.
- [ ] **22.7.7** Redacted-source handling — sources imported with placeholder credentials are created credential-less and flagged "needs credentials" in the sources view.
- [ ] **22.7.8** All-or-nothing apply — any validation failure rejects the whole import with a classified message and leaves state untouched; successful applies go through the same `defineFn` setters as UI edits.
- [ ] **22.7.9** Safe filename — name exports `thundertv-settings-YYYY-MM-DD.json`; never embed profile names or source hosts in the filename.
- [ ] **22.7.10** Import/export tests — cover default redaction, consent inclusion, round-trip equality, double-import idempotence, and malformed-document rejection.

## Feature 22.8 — Central strings module

The strings module has existed since the first UI phase — this feature makes it exhaustive and enforceable: every user-facing literal keyed in `src/app/strings.ts`, guarded by lint so drift is impossible from here on.

- [ ] **22.8.1** Exhaustive consolidation — sweep all partials and UI modules from Phases 02–21, moving every remaining user-facing literal into `src/app/strings.ts` under stable, view-prefixed keys.
- [ ] **22.8.2** State-published strings — publish the strings object once at boot (`setValue('str', strings)`) so partials bind `{{str.settings.title}}` without per-view plumbing; record the pattern as a decision note.
- [ ] **22.8.3** Lint guard — add a guard wired into `npm run lint` (custom rule or `scripts/check-strings.mjs`) failing on literal text nodes in `src/ui/` partials and flagged string literals in UI TS modules, with a small explicit allowlist (punctuation, units).
- [ ] **22.8.4** Stable key policy — keys are identifiers, never English sentences, so a future i18n pass is a value-table swap without touching call sites.
- [ ] **22.8.5** Format helper — extend the Phase 07.6.9 count-aware helper into a general `fmt(key, params)` for parameterized lines (episode prompts, import counts); concatenating sentence fragments at call sites remains a reject.
- [ ] **22.8.6** Accessibility strings — include `aria-label` and `title` attribute values in the module's scope; icon-only controls resolve their labels through keys.
- [ ] **22.8.7** File-size discipline — split the table into `src/app/strings/*.ts` domain files re-exported through `src/app/strings.ts` once the 300-line target nears, keeping the import path stable.
- [ ] **22.8.8** Convention docblock — document key naming, what counts as "user-facing", and the allowlist policy in the module header; §7 already makes hardcoded literals a review reject.
- [ ] **22.8.9** Guard self-test — a test runs the lint guard against a fixture partial containing a hardcoded literal and asserts failure (and that a clean fixture passes).
- [ ] **22.8.10** fmt tests — unit test interpolation, missing-parameter behavior, and pluralized counts against fixture keys.

## Feature 22.9 — About/diagnostics section

About answers support questions locally: what version is this, what tier is storage on, are the budgets holding — plus the license obligations — with nothing fetched and nothing sensitive shown.

- [ ] **22.9.1** Build-time identity — inject the version (from `package.json`) and build date via Vite `define` constants, rendered at the top of the section.
- [ ] **22.9.2** Storage-tier line — show the active tier (full/partial/none) with the same plain-words explanation the tier notice uses, plus the probe-result timestamp.
- [ ] **22.9.3** Budget snapshot — display live counts on section open (loaded channels, stored EPG programs, current DOM row count, last import duration, last search latency), computed once per open — no polling loop.
- [ ] **22.9.4** Licenses list — generate a third-party notices file at build time (`scripts/gen-licenses.mjs` over package metadata: Spektrum, hls.js, mpegts.js, idb, fflate) rendered in a scrollable block.
- [ ] **22.9.5** Spektrum resolution — show which Spektrum the import map resolved (pinned CDN URL or vendored `public/vendor/spektrum.min.js`) to make packaged-target debugging trivial.
- [ ] **22.9.6** Copy diagnostics — a button copying version, tier, user agent, and the budget snapshot to the clipboard — never sources, URLs, or credentials.
- [ ] **22.9.7** Reserved rows — leave stable, `data-if`-gated slots for Phase 24's install entry and service-worker status so About's layout doesn't churn later.
- [ ] **22.9.8** Fully local — assert the section triggers zero network requests (no update checks, no remote license fetch); everything rendered is baked in or local state.
- [ ] **22.9.9** Denylist check — a test runs the copy-diagnostics payload through the credential-denylist helper from 21.10.7, asserting no `user=`/`password=`/userinfo patterns.
- [ ] **22.9.10** About smoke — rendered-DOM test asserting version, tier, licenses, and the reserved slots exist; manual check on built `dist/` recorded here.

## Feature 22.10 — Settings unit tests

The settings surface earns its own suite: schema-driven round-trips, import validation tables, and redaction defaults — the tests that make future phases safe to touch preferences.

- [ ] **22.10.1** Schema-driven round-trip — iterate the schema to mutate → snapshot → rehydrate → compare every key automatically, so a newly added setting gets covered without touching the suite.
- [ ] **22.10.2** Redaction default — a two-Xtream-source fixture asserts the default export carries placeholders and no fixture password appears anywhere in the serialized document.
- [ ] **22.10.3** Consent inclusion — with the consent flag set, assert real credentials appear and that the flag itself is never persisted into settings.
- [ ] **22.10.4** Validation table — table-driven import tests: wrong version, wrong types, truncated JSON, unknown top-level fields, empty document — each rejected with its classified reason and zero state mutation.
- [ ] **22.10.5** Upsert idempotence — importing the same export twice yields identical source lists via the shared source key.
- [ ] **22.10.6** Clamp coverage — action-layer clamps for the recent cap and zap size reject out-of-range values without a persist call (spy on the bridge).
- [ ] **22.10.7** Bridge exclusivity — a regression test spies on the `StorageAdapter`, asserting no settings write bypasses the persistence bridge.
- [ ] **22.10.8** Boot-order regression — assert rehydration completes before `run()` binds the DOM by instrumenting the boot sequence with a mocked storage adapter.
- [ ] **22.10.9** Guard wiring — verify the strings guard (22.8.3) and the no-transition check (22.5.5) actually execute under `npm run lint` by asserting on their exit codes in a local CI-equivalent run.
- [ ] **22.10.10** Phase bookkeeping — check every box, record decision notes (no Save button, last-writer-wins tabs, consent-not-persisted), and run the standing verification checklist from MASTERPLAN.md §3.
