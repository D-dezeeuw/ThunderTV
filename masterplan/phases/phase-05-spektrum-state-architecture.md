# Phase 05 — Spektrum State Architecture

> **Epic goal:** Make Spektrum the app's single state layer — organized store modules, a `defineFn`-only action layer, a debounced persistence bridge to the `StorageAdapter`, and session/channel-state caching — so a reboot restores the last-watched channel row rendered and playable before any playlist re-parse.
> **Verification:** Every mutation in the codebase goes through a `defineFn` action (grep proves no bare `setValue` outside `src/state/` and the sanctioned publishers); the persistence bridge batches dirty keys into one debounced `setMany`; on the built `dist/`, setting a fake active channel + zap history, reloading, and observing the restored session *before* any heavy load demonstrates the §6.4 boot order on the full and partial tiers; replay is capped in dev and disabled in prod; and the bindDOM state suite passes under `npm test`.

Before this phase, Spektrum holds ad-hoc UI values (`ui.activeView`, `ui.density`, `storage.tier`) written directly by shell code, and nothing survives a reload. After it, `src/state/` owns a modular store (`state/playlist`, `state/player`, `state/epg`, `state/settings`, `state/ui`) mutated exclusively through `defineFn` actions; actions that touch persisted keys mark them dirty and a debounced bridge snapshots them to the storage engine (MASTERPLAN.md §6.3); boot rehydrates saved keys before `run()` and before any heavy load (§6.4); the channel-state cache (last-watched snapshot, capped zap history, per-view UI state) makes session restore instant; time-travel history is capped in dev and off in prod; and bulk imports are documented and enforced as bypassing recorded state entirely. This is the last foundation phase — Phase 06's parser lands into a finished state architecture.

## Feature 05.1 — Store module layout (state/playlist, state/player, state/epg, state/settings, state/ui)

Carve Spektrum's flat key space into five owned modules with declared keys, initial values, and clear ownership — so every later phase knows exactly where its state lives.

- [ ] **05.1.1** Create the module files — `src/state/playlist.ts`, `player.ts`, `epg.ts`, `settings.ts`, and `ui.ts`, each declaring its key constants, types, and initial values; plus `src/state/index.ts` composing initialization order.
- [ ] **05.1.2** Namespace the keys — adopt dotted prefixes matching the module (`playlist.*`, `player.*`, `epg.*`, `settings.*`, `ui.*`) and export them as typed constants (no string literals at call sites).
- [ ] **05.1.3** Migrate existing state — move `ui.activeView`, `ui.density`, `ui.settingsOpen`, `storage.tier` (relocated under `ui.storageTier` or kept — decide and note), and `platform.*` seeding into the owning modules, deleting the scattered Phase 02/04 `setValue` sites.
- [ ] **05.1.4** Define `state/player` shape — `player.active` (denormalized channel snapshot or null), `player.zapHistory` (capped id list), `player.volume`, `player.muted` — the keys §6.3/§6.4 name.
- [ ] **05.1.5** Define `state/playlist` shape — `playlist.sources` (source meta list), `playlist.activeSourceId`, `playlist.importProgress` — deliberately *not* the channel rows themselves (those live in module memory per §5.4).
- [ ] **05.1.6** Define `state/epg` and `state/settings` shapes — `epg.tick` (the global 30 s heartbeat key from §5.5) plus mapping stubs; `settings.*` mirrors the stored settings blob (proxy template, density, playback prefs).
- [ ] **05.1.7** Declare persistence class per key — each module annotates every key as `persisted` or `session` in a single exported `KEY_REGISTRY`, which the Feature 05.3 bridge and Feature 05.9 docs both consume (one source of truth).
- [ ] **05.1.8** Enforce initialization order — `initState()` seeds all modules' defaults before rehydration overwrites them, and nothing calls `run()` until both complete; assert ordering with a boot-sequence spec.
- [ ] **05.1.9** Keep modules small — each state module stays well under 300 lines by holding only keys, types, initial values, and its actions (Feature 05.2); computed selectors move to Feature 05.6's files.
- [ ] **05.1.10** Document ownership — `src/state/README.md` table: module → keys → persistence class → owning phase, with the rule that adding a key means adding it to the registry and this table in the same commit.

## Feature 05.2 — Action layer with defineFn (all mutations via actions)

Every mutation goes through a named `defineFn` action — deterministic, testable, greppable, and the hook point for persistence — with bare `setValue` banned outside sanctioned publishers.

- [ ] **05.2.1** Define the convention — actions live beside their module (`src/state/player.actions.ts` etc.), are registered via `defineFn('player/setActiveChannel', ...)` with module-prefixed names, and are the only writers of their module's keys.
- [ ] **05.2.2** Port the reference action — implement `player/setActiveChannel` exactly in the §6.3 shape: `setValue('player.active', ch)`, capped-push into `player.zapHistory` via a `pushCapped` util, then `persist()` both keys.
- [ ] **05.2.3** Convert the shell — rewrite the Phase 02 `navigate`, `toggleSettings`, `setDensity`, and `dismissStorageNotice` handlers as module actions in `ui.actions.ts` / `settings.actions.ts`, wiring `data-action` names to the new registrations.
- [ ] **05.2.4** Whitelist the publishers — document and enforce the short list of non-action `setValue` writers: the router (`ui.activeView`), the virtual-list window publisher (Phase 08, `list.*` per §5.4), and the global tick (`epg.tick`) — each annotated with a `// sanctioned-publisher` marker comment.
- [ ] **05.2.5** Fence with lint — add a `no-restricted-imports`/`no-restricted-syntax` rule flagging `setValue` calls outside `src/state/` and files carrying the sanctioned-publisher marker, turning the convention into a build failure.
- [ ] **05.2.6** Type the action payloads — export a typed helper `action<T>(name, fn)` wrapping `defineFn` so payload types are declared once and callable signatures are checkable from templates' `data-action` wiring docs.
- [ ] **05.2.7** Keep actions synchronous — actions mutate state synchronously (Spektrum is synchronous and deterministic); async work (storage, network) happens in services that then call actions with results — document with one worked example (`playlist/importCompleted`).
- [ ] **05.2.8** Add `pushCapped` and friends — implement `src/state/collections.ts` with `pushCapped(list, item, cap)` and dedup-front semantics for zap history and recent lists, unit-tested against boundary sizes.
- [ ] **05.2.9** Unit-test the actions — Vitest specs per module: dispatching each action produces exactly the expected key writes (spy on `setValue`) and marks exactly the expected dirty keys.
- [ ] **05.2.10** Grep-gate the ban — extend `scripts/check-dist.mjs` (or a sibling `check-state.mjs`) to fail when unsanctioned `setValue` call sites appear outside `src/state/`, and record the clean run in this file.

## Feature 05.3 — Persistence bridge (actions mark dirty keys → debounced batch snapshot to StorageAdapter, per MASTERPLAN.md §6.3)

No framework introspection: actions explicitly `persist(key)`, a 500 ms debounced flush snapshots all dirty keys in one `setMany` — deterministic, testable, and upgrade-proof.

- [ ] **05.3.1** Implement `persist()` — `src/state/persist.ts` per the §6.3 reference: a module-level `Set<string>` of dirty keys, `clearTimeout`/`setTimeout` debounce (500 ms), flush via `storage.setMany(batch.map(k => [k, snapshot(k)]))`.
- [ ] **05.3.2** Implement `snapshot(key)` — read the current Spektrum value for the key, pass it through the Feature 04.9 version envelope, and `structuredClone`-safe it; keys must appear in `KEY_REGISTRY` as `persisted` or `persist()` throws in dev.
- [ ] **05.3.3** Flush through the platform — the bridge reaches storage only via `getPlatform().storage` so runtime tier demotion (Phase 04.7) transparently redirects snapshots mid-session.
- [ ] **05.3.4** Handle flush failure — a `{ ok: false }` from `setMany` re-marks the batch dirty, relies on the storage layer's demotion to change tiers, and retries on the next debounce window — never loops hot, never throws into an action.
- [ ] **05.3.5** Flush on page hide — a `visibilitychange`/`pagehide` listener forces an immediate synchronous-best-effort flush of pending dirty keys so closing the tab right after zapping still persists the session.
- [ ] **05.3.6** Coalesce correctly — multiple actions within the window produce one `setMany` containing each dirty key once with its *latest* value; spec this with interleaved `setActiveChannel` calls.
- [ ] **05.3.7** Keep the bridge dumb — `persist.ts` knows keys and storage, nothing else: no per-key special cases, no serialization branching (the envelope owns shape) — hold it under 100 lines.
- [ ] **05.3.8** Expose test seams — export `flushNow()` and `pendingKeys()` for specs and the pagehide path, marked `@internal`.
- [ ] **05.3.9** Unit-test the debounce — fake-timer specs: batch after 500 ms, timer reset on new dirtying, single `setMany` per window, failure re-queue, `flushNow` draining, pagehide flush.
- [ ] **05.3.10** Integration-test through tiers — a spec running the bridge against `MemoryStorage` and `LocalStorageStorage` from the matrix fixtures proving envelope-versioned values land byte-identical through `getMany` on the other side.

## Feature 05.4 — Boot rehydration and session restore (restore-before-heavy-load order, §6.4)

The boot order is the product: storage → `getMany` saved keys → seed Spektrum → `run()` (UI shows the last session *now*) → only then the heavy playlist load. Rehydration must never wait on parsing.

- [ ] **05.4.1** Implement the boot sequence — `src/app/bootstrap.ts` per the §6.4 reference: `createPlatform()` → `storage.getMany([...persistedKeys])` → `setValue` each defined result → `run()` → `void loadActiveSource()` (stubbed heavy path until Phase 06).
- [ ] **05.4.2** Derive the key list — the rehydration `getMany` list comes from `KEY_REGISTRY`'s `persisted` entries (05.1.7), so adding a persisted key automatically joins boot restore — no second list to forget.
- [ ] **05.4.3** Seed-then-overwrite — module defaults from `initState()` apply first; rehydration overwrites only keys with defined stored values (the `getMany` holes contract from 04.3.8), so a missing key never clobbers a default with `undefined`.
- [ ] **05.4.4** Tolerate bad blobs — a stored value failing envelope validation/migration is skipped with one redacted diagnostic; boot continues on defaults — a corrupt snapshot must never brick startup.
- [ ] **05.4.5** Order against the connect flow — document and encode that the Phase 14 connect-fragment parse runs after platform creation but its scrub happens before any third-party request, and rehydration does not await it; leave the sequenced hook point in `bootstrap.ts` now.
- [ ] **05.4.6** Render the restored session — after `run()`, the (stub) player dock area and Recent view render `player.active` and `player.zapHistory` from state alone — visibly populated with zero playlist data loaded, proving the §6.4 promise.
- [ ] **05.4.7** Measure restore cost — instrument boot with `performance.mark` (platform-ready, rehydrated, first-render) and record numbers against the < 1 s cold-start budget on the full tier.
- [ ] **05.4.8** Verify partial-tier restore — on the partial tier, confirm the restored snapshot renders and is interaction-ready while sources would re-parse behind it (heavy path still stubbed; simulate with a delay) — the fast path the plan promises for constrained devices.
- [ ] **05.4.9** Unit-test the order — a boot-sequence spec with `FakePlatform` asserting call order (getMany before run, heavy loader after run) and that a slow storage `getMany` delays render but a slow heavy loader does not.
- [ ] **05.4.10** Manual reload drill — on built `dist/`, set a fake active channel via a dev action, reload, and confirm the session state is visible before the simulated heavy load completes, on full and partial tiers; record timings here.

## Feature 05.5 — Channel-state cache (last-watched channel snapshot, capped zap history, per-view UI state)

The cache that makes reboot instant: a denormalized last-watched snapshot (name, stream URL, logo, group — playable without any playlist), a capped zap history, and per-view UI state — all small enough for every tier.

- [ ] **05.5.1** Define the snapshot type — `ActiveChannelSnapshot` in `src/state/records.ts` (aligned with the storage `records.ts` favorite shape): `id`, `sourceId`, `name`, `streamUrl`, `logo`, `group` — everything needed to render a row and start playback, per §6.4.
- [ ] **05.5.2** Denormalize at set time — `player/setActiveChannel` stores the full snapshot (not an id needing playlist lookup), so restore works before any parse and on the partial tier where bulk rows are gone.
- [ ] **05.5.3** Cap zap history at 20 — `player.zapHistory` holds snapshots (not ids — same restore argument), deduped to front, capped via `pushCapped(..., 20)` per the §6.3 reference; decide and note whether display trims to 10.
- [ ] **05.5.4** Add per-view UI state — promote the Phase 02.5.5 scroll-position map into `ui.viewState` (per-view: scroll offset, selected group, search text), marked `session` for scroll but `persisted` for group/search choices — registry-driven, decision noted inline.
- [ ] **05.5.5** Persist the trio — mark `player.active`, `player.zapHistory`, and the persisted slice of `ui.viewState` in `KEY_REGISTRY`; verify their combined serialized size stays comfortably inside the localStorage small-data budget (target < 32 KB total).
- [ ] **05.5.6** Restore into the Recent stub — the Recent view lists `player.zapHistory` snapshots immediately after boot rehydration, giving the cache a visible consumer before Phase 13's full recent/favorites feature.
- [ ] **05.5.7** Invalidate on source removal — removing a source (action stub for Phase 15) clears `player.active`/`zapHistory` entries whose `sourceId` matches, so restore never offers a stream from a deleted subscription.
- [ ] **05.5.8** Never cache credentials in snapshots — assert (spec + review note) that `streamUrl` snapshots for Xtream sources are constructed URLs treated as secrets: excluded from logs and error messages, per the standing credential conventions.
- [ ] **05.5.9** Unit-test the cache — specs: snapshot denormalization on set, cap-and-dedup behavior across 25 zaps, per-view state round-trip through the bridge, and source-removal invalidation.
- [ ] **05.5.10** End-to-end restore proof — combined with 05.4.10: after reload, the restored active-channel row renders from the snapshot alone and its (stub) play affordance carries the correct `streamUrl` — captured as the phase's flagship manual verification.

## Feature 05.6 — Computed selectors (active source, visible rows contract, favorite ids)

Derived state lives in `computed()` selectors, never re-derived ad hoc in templates or duplicated into stored keys — including the contract around the windowed `list.visibleRows` slice that Phase 08 will publish.

- [ ] **05.6.1** Create selector modules — `src/state/playlist.selectors.ts`, `player.selectors.ts`, and `ui.selectors.ts` registering named `computed()` values, imported for side effect from `state/index.ts` after seeding.
- [ ] **05.6.2** Implement `activeSource` — a `computed` joining `playlist.activeSourceId` against `playlist.sources`, resolving to the source meta or null; the single way any template/service names "the current playlist".
- [ ] **05.6.3** Implement `favoriteIds` — a `computed` `Set`-shaped lookup (serialized as needed for templates) over the favorites snapshot state, ready for Phase 08 row rendering and Phase 13's toggle to consume without list scans.
- [ ] **05.6.4** Codify the visible-rows contract — document (and stub) that `list.visibleRows`, `list.padTop`, `list.padBottom` are *published inputs* (sanctioned publisher, §5.4), while anything derived from them (row count, empty-list flag) is `computed` here — the module boundary between windowing and state.
- [ ] **05.6.5** Implement view-gating selectors — replace the Phase 02.5.2 per-view booleans with registered computeds (`isSourcesView` etc.) derived from `ui.activeView`, deleting the inline expressions.
- [ ] **05.6.6** Derive the storage notice — re-express the Feature 04.8 notice visibility as one `computed` over `ui.storageTier` + dismissal flag, so the template holds a single binding.
- [ ] **05.6.7** Keep selectors cheap — the rule (documented + reviewed): a `computed` may not iterate collections that can exceed ~1000 items (§5.8's rule of thumb); big derivations happen in module memory and publish results.
- [ ] **05.6.8** No selector writes — selectors are read-only by definition; extend the lint marker convention so `setValue` inside a `*.selectors.ts` file is flagged.
- [ ] **05.6.9** Unit-test derivations — specs: `activeSource` resolves and nulls correctly, `favoriteIds` updates when the underlying snapshot changes, view gating flips exactly one flag per route change.
- [ ] **05.6.10** Verify recompute granularity — a bindDOM spec asserting an unrelated key write (e.g. `epg.tick`) does not re-render a node bound to `activeSource` (Spektrum dependency precision, guarding against accidental global invalidation).

## Feature 05.7 — Time-travel policy (replay capped in dev, disabled in prod)

Spektrum's `replay(n)` is a free debugging tool in dev and a memory bomb in prod: history is capped at 200 in development and fully disabled in production builds, per §5.8.

- [ ] **05.7.1** Implement the policy module — `src/state/history-policy.ts` per the §5.8 reference: `import.meta.env.PROD` → history limit 0; dev → limit 200; invoked once from `state/index.ts` before any mutation.
- [ ] **05.7.2** Adapt to Spektrum's actual API — verify the pinned `spektrum@1.1.0` surface for history configuration (`configureHistory` or equivalent); if the API differs, implement the closest supported mechanism and note the decision inline per the autonomy rule.
- [ ] **05.7.3** Gate `replay` usage — `replay(n)` calls may exist only in dev tooling (`src/state/devtools.ts`), itself imported behind `if (import.meta.env.DEV)` so it tree-shakes out of `dist/`.
- [ ] **05.7.4** Build the dev helper — a tiny dev-only console helper exposing `__tl.replay(n)` and `__tl.dumpState()` for debugging sessions, documented in the README's debugging section.
- [ ] **05.7.5** Verify prod exclusion — inspect the built `dist/` bundle to confirm no devtools/replay code ships (grep for the helper's symbols in `scripts/check-dist.mjs`).
- [ ] **05.7.6** Measure dev-mode cost — with the 200-entry cap, exercise 1 000 rapid mutations in dev and confirm memory stays bounded (devtools heap snapshot), recording the observation.
- [ ] **05.7.7** Interlock with bulk rules — cross-reference Feature 05.8: because bulk data never enters recorded state, the 200-entry dev history holds only compact UI mutations — state this as the invariant that makes the cap sufficient.
- [ ] **05.7.8** Spec the environment split — Vitest specs (with `import.meta.env` stubbed both ways) asserting limit-0 configuration in prod mode and limit-200 in dev mode.
- [ ] **05.7.9** Document the debugging workflow — README: how to reproduce a state bug with `replay` in dev, and why prod builds intentionally cannot.
- [ ] **05.7.10** Add the standing check — extend the phase-verification checklist template: any new phase adding state features re-verifies prod history stays disabled (one-line check in `scripts/check-dist.mjs` keeps it mechanical).

## Feature 05.8 — Bulk-data bypass rules (imports never flow through recorded state)

The §5.4/§5.8 discipline as enforceable architecture: anything that can exceed ~1000 items lives in module memory and storage, publishing only derived slices — a 100 k-channel import must record zero mutations.

- [ ] **05.8.1** Write the rule down as code — `src/state/bulk-policy.ts` exporting the documented threshold (`MAX_RECORDED_COLLECTION = 1000`) and a dev-mode `assertCompact(key, value)` guard warning when a `setValue` payload's array length exceeds it.
- [ ] **05.8.2** Hook the guard — wire `assertCompact` into the action helper from 05.2.6 (dev builds only), so an accidental `setValue('playlist.channels', all90k)` fails loudly in development and costs nothing in prod.
- [ ] **05.8.3** Define the channels home — create `src/m3u/channel-memory.ts` (stub for Phase 06): module-level `allRows: Channel[]` with `setRows`/`getRows`/`query` — the plain-memory query layer the plan mandates, explicitly outside Spektrum.
- [ ] **05.8.4** Specify the import flow — document the pipeline contract in `src/state/README.md`: worker chunk → `writeChunked` to storage → append to channel memory → *one* `playlist/importProgress` action per chunk (a compact counter object) — no row data through actions, ever.
- [ ] **05.8.5** Bound the exceptions — enumerate the compact collections allowed in state (zap history ≤ 20, sources list, favorites snapshots, visible window ≤ ~40 rows) in `KEY_REGISTRY` metadata (`maxItems`), asserted by the guard.
- [ ] **05.8.6** Keep EPG out too — extend the policy notes to Phase 16/17: program stores stay in storage + memory index; only per-visible-row now/next enrichment reaches state on the tick — recorded here so the EPG phases inherit the rule, not rediscover it.
- [ ] **05.8.7** Spec the guard — Vitest specs: 1001-item array through an action warns in dev mode, 40-row window slice passes silently, registry `maxItems` violations are reported with the offending key name.
- [ ] **05.8.8** Prove import silence — an integration spec simulating a 10 k-row chunked import through the documented pipeline, asserting the number of recorded history entries stays O(chunks) small (progress actions only) and no state key ever holds a row array.
- [ ] **05.8.9** Verify memory stance — heap-snapshot a simulated large import in dev (history cap active) and record that retained size is dominated by channel memory, not history entries.
- [ ] **05.8.10** Cross-link the docs — update `src/core/storage/README.md` and `src/state/README.md` to reference each other's halves of the pipeline (storage persists / memory queries / state renders), keeping the three-role rule in one narrative.

## Feature 05.9 — State shape typing and documentation (state-keys reference doc)

Every key, type, persistence class, cap, and owner in one generated-from-source reference — the map future phases (and future agent sessions) navigate by.

- [ ] **05.9.1** Centralize the registry type — finalize `KEY_REGISTRY` as `Record<StateKey, { type: <TS type name>, persisted: boolean, maxItems?: number, owner: module, since: 'phase-05' | ... }>` with `StateKey` as a template-literal union over module prefixes.
- [ ] **05.9.2** Type `setValue`/`getValue` — wrap Spektrum's primitives in typed helpers (`src/state/typed.ts`): `set(key, value)` and `get(key)` inferring value types from the registry, used by all actions/selectors (raw imports remain for sanctioned publishers, noted).
- [ ] **05.9.3** Generate the reference doc — `scripts/gen-state-keys.mjs` emitting `masterplan/reference/state-keys.md` from `KEY_REGISTRY` (key, type, persisted, caps, owner, description) — run manually, committed output, no Actions.
- [ ] **05.9.4** Guard doc freshness — the script supports `--check` (regenerate to temp, diff against committed) wired into the standing verification checklist so the doc cannot drift from the registry.
- [ ] **05.9.5** Document the session-restore keys — the reference doc flags the §6.4 boot-critical set (`settings`, `player.active`, `player.zapHistory`, favorites snapshot) so their combined size budget and restore role stay visible.
- [ ] **05.9.6** Describe the publishers — a section listing the sanctioned non-action publishers (router, window publisher, tick) with their keys and the marker-comment convention from 05.2.4.
- [ ] **05.9.7** Cover the naming rules — key naming (`module.camelCase`), action naming (`module/verbPhrase`), and the rule that renaming a persisted key requires a Feature 04.9 migration hook — all stated once, here.
- [ ] **05.9.8** Type-test the registry — compile-time specs (`@ts-expect-error` cases) proving `set('player.active', wrongShape)` fails and unknown keys are rejected — strictness the runtime never has to catch.
- [ ] **05.9.9** Verify line budgets — confirm registry + typed helpers stay within file-size limits (split `KEY_REGISTRY` per module and merge in `index.ts` if approaching 300 lines).
- [ ] **05.9.10** Link from the README — add the state-keys reference to the README's architecture section as the canonical answer to "where does this state live and does it persist?".

## Feature 05.10 — State unit tests through a bindDOM harness (mutation → DOM assertions)

The proof that state and bindings compose: a reusable harness that mounts real templates with Spektrum bindings in jsdom, dispatches actions, and asserts DOM output — the test style all later UI phases inherit.

- [ ] **05.10.1** Build the harness — `src/shared/testing/bind-dom.ts` (test-only): `mountTemplate(html)` injects markup, initializes state modules fresh, calls Spektrum's binding pass (`run()` scoped or global re-run — verify against the pinned 1.1.0 API and note the mechanism), and returns query/cleanup helpers.
- [ ] **05.10.2** Isolate between specs — the harness resets Spektrum state, `KEY_REGISTRY`-seeded defaults, dirty-key sets, and DOM between tests so specs cannot order-couple; verify by running the suite shuffled.
- [ ] **05.10.3** Support action dispatch — a `dispatch(name, payload)` helper invoking registered `defineFn` actions exactly as `data-action` would, keeping specs at the user-semantics level.
- [ ] **05.10.4** Cover the flagship flow — spec: dispatch `player/setActiveChannel` twice → assert a `{{player.active.name}}`-bound node shows the latest name and a `data-each`-bound zap-history list renders both snapshots in order.
- [ ] **05.10.5** Cover rehydration rendering — spec: seed storage via `FakePlatform`, run the bootstrap rehydration path, mount the session template, and assert the restored channel row renders before the (never-invoked) heavy loader.
- [ ] **05.10.6** Cover conditional bindings — specs for `data-if` gating (storage notice, view switching via selectors) asserting nodes attach/detach on state flips.
- [ ] **05.10.7** Cover `data-model` round-trip — a spec binding a settings input via `data-model`, simulating user input, and asserting the settings action + dirty-key marking fire (the pattern Phase 22's panel will scale up).
- [ ] **05.10.8** Assert persistence side effects — harness exposes the bridge's `pendingKeys()`; flagship specs assert the right keys go dirty and `flushNow()` lands them in the fake storage — closing the loop from DOM event to stored byte.
- [ ] **05.10.9** Keep the harness honest — the harness itself gets a meta-spec (state leaks between mounts fail; a deliberately broken binding is detectable), so downstream phases can trust red means red.
- [ ] **05.10.10** Close the phase — full `npm test` (state suite + storage matrix + adapter suite), lint/typecheck/build green, `--check` doc freshness pass, the manual reload drill from 05.4.10/05.5.10 evidenced on the deployed Pages URL, phase `> Verification:` line checked, and `feature/phase-05-spektrum-state-architecture` merged.
