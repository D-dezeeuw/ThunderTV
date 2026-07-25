# Phase 04 — Tiered Storage Engine

> **Epic goal:** Deliver the probe-selected tiered storage layer — IndexedDB (full), localStorage (partial), in-memory (none) — behind one async `StorageAdapter`, with runtime demotion and chunked bulk writes, so the app is fully functional on every tier and tier choice only ever changes what survives a reload.
> **Verification:** The identical storage test matrix passes against all three tiers under `npm test`; the boot probe demonstrably selects `full`/`partial`/`none` when IndexedDB and localStorage are selectively broken (verified manually in private-mode and devtools-sabotaged sessions on the built `dist/`); a forced runtime write failure demotes the session, shows the one-line notice, and never white-screens; and `platform.capabilities.durableStorage` reports the live tier.

Before this phase, `PlatformAdapter.storage` is a typed stub reporting `durableStorage: 'none'`. After it, `src/core/storage/` contains the real engine: a boot probe that round-trips an actual write (never trusting `window.indexedDB`'s presence), `MemoryStorage` as the reference implementation, an `idb`-based IndexedDB tier with the plan's eight stores, a chunked/quota-guarded localStorage tier for small valuable data, ~5000-row chunked bulk writes for channels and EPG, runtime demotion with a session re-probe, a dismissible storage-mode notice, versioned stored shapes with migration hooks, and one test suite that every tier must pass unchanged. The in-memory array remains the query layer on every tier — tiers only decide persistence.

## Feature 04.1 — StorageAdapter async interface (get/set/getMany/setMany/bulk table ops)

One async interface, identical across tiers, shaped so a future Electron SQLite implementation is just a fourth class — the contract everything above storage programs against.

- [ ] **04.1.1** Finalize the interface — flesh out `src/core/storage/storage-adapter.ts` from the Phase 03 type stub: `get(key)`, `set(key, value)`, `getMany(keys)`, `setMany(entries)`, `delete(key)`, plus the tier discriminant `readonly tier: 'full' | 'partial' | 'none'`.
- [ ] **04.1.2** Add bulk table ops — `bulkPut(table, rows, keyOf)`, `getAll(table, range?)`, `getRange(table, lower, upper)`, `clearTable(table)`, `count(table)` for the channels/EPG bulk paths, typed against a `TableName` union.
- [ ] **04.1.3** Name the tables — export the `TableName` union matching the plan's IDB layout: `playlists`, `channels`, `groups`, `epgChannels`, `epgPrograms`, `favorites`, `recent`, `settings`.
- [ ] **04.1.4** Type the values — define per-table row types in `src/core/storage/records.ts` (source meta with `etag`/`lastModified`, parsed channel rows, denormalized favorite/recent snapshots) shared by all tiers and the state layer.
- [ ] **04.1.5** Make everything async — every method returns a promise even where the backing store is synchronous (localStorage, memory), so callers never branch on tier and the SQLite-over-IPC future needs no signature change.
- [ ] **04.1.6** Define failure semantics — methods resolve `{ ok: true } | { ok: false; reason }` for writes (never throw for quota/IO); document that a failed write triggers the Feature 04.7 demotion path.
- [ ] **04.1.7** Specify key-value vs table split — TSDoc: `get`/`set` serve small keyed snapshots (settings, session state); table ops serve bulk rows; mixing them is a review reject.
- [ ] **04.1.8** Keep the interface dependency-free — `storage-adapter.ts` and `records.ts` import nothing (types only), so workers and `src/state/` can import shapes without pulling implementations.
- [ ] **04.1.9** Write the contract spec skeleton — start `src/core/storage/storage-contract.spec.ts` as a parameterized suite factory `describeStorageContract(makeAdapter)` that Features 04.3–04.5 and 04.10 will run per tier.
- [ ] **04.1.10** Document the layering rule — `src/core/storage/README.md`: workers parse, memory is the query layer, storage persists — with the explicit statement that tier degradation changes boot behavior, never feature behavior (plan §5).

## Feature 04.2 — Boot-time probe with real open+write round-trip

Feature detection lies: `window.indexedDB` exists where `open()` fails. The probe performs a real open + write + delete round-trip per MASTERPLAN.md §5.1, and its verdict — not presence checks — selects the tier.

- [ ] **04.2.1** Port `probeIndexedDb` — implement `src/core/storage/probe.ts` from the MASTERPLAN.md §5.1 reference: open `__probe__`, create a store, put a value in a `readwrite` transaction, close, `deleteDatabase`, resolve boolean.
- [ ] **04.2.2** Handle `onblocked` — treat a blocked open as failure (per the reference) and add a hard timeout (~2 s) around the whole probe so a hung TV webview cannot stall boot.
- [ ] **04.2.3** Implement `probeLocalStorage` — synchronous set/get/remove round-trip of a probe key under try/catch, catching private-mode quota-zero throws.
- [ ] **04.2.4** Build the factory — `createStorage()` in `src/core/storage/index.ts` per §6.2: IDB probe passes → `IdbStorage`; else localStorage probe → `LocalStorageStorage`; else `MemoryStorage`.
- [ ] **04.2.5** Wire into the platform — `createWebPlatform()` awaits `createStorage()`, assigns it to `platform.storage`, and sets `capabilities.durableStorage` from the adapter's `tier` — replacing the Phase 03 stub.
- [ ] **04.2.6** Keep the probe fast — measure probe cost on the happy path (target < 50 ms) and record it against the < 1 s cold-start budget; the probe must not delay first paint beyond it.
- [ ] **04.2.7** Publish the result — set `storage.tier` in Spektrum state at boot for the Feature 04.8 notice and diagnostics; core code keeps reading `capabilities.durableStorage`.
- [ ] **04.2.8** Unit-test the decision tree — Vitest specs with stubbed probes: pass/pass → full, fail/pass → partial, fail/fail → none; assert exactly one adapter is constructed.
- [ ] **04.2.9** Unit-test probe failure modes — specs simulating `open` error, write error after successful open (read-only engines), `onblocked`, and probe timeout, all resolving `false` without unhandled rejections.
- [ ] **04.2.10** Manual matrix on built `dist/` — verify tier selection in a normal Chromium profile (full), Firefox private mode or devtools-sabotaged IDB (partial), and both stores blocked (none), recording observed tiers in this file.

## Feature 04.3 — MemoryStorage reference implementation

The simplest tier is the semantic authority: `MemoryStorage` defines correct behavior for every operation, and the other tiers must match it spec-for-spec.

- [ ] **04.3.1** Implement the class — `src/core/storage/memory-storage.ts`: `Map`-backed key-value store plus a `Map<TableName, Map<key, row>>` for table ops, `tier: 'none'`.
- [ ] **04.3.2** Implement range semantics — `getRange` over sorted composite keys (e.g. `[channelId, start]` for `epgPrograms`) with an explicit key-encoding helper shared with the IDB tier so orderings can never diverge.
- [ ] **04.3.3** Deep-copy on the boundary — `structuredClone` values on set _and_ get so callers cannot mutate stored state by reference; document this as contract behavior all tiers must exhibit.
- [ ] **04.3.4** Honor write results — return `{ ok: true }` always (memory cannot meaningfully fail) while keeping the result shape, so calling code is exercise-identical across tiers.
- [ ] **04.3.5** Implement `clearTable`/`count` — trivial here, but specified precisely (count after clear is 0; bulkPut upserts by key) because these become the matrix assertions.
- [ ] **04.3.6** Keep it under 150 lines — the reference implementation stays small enough to be read as documentation; split key-encoding into `src/core/storage/keys.ts`.
- [ ] **04.3.7** Fill the contract suite — complete `describeStorageContract` from 04.1.9 with the full behavioral spec set (kv round-trip, getMany ordering and missing-key holes, bulk upsert, range queries, clear/count, clone isolation) and run it against `MemoryStorage` first.
- [ ] **04.3.8** Specify `getMany` holes — contract-spec that missing keys yield `undefined` slots in input order (the §6.4 boot rehydration loop depends on this exact shape).
- [ ] **04.3.9** Use it in `FakePlatform` — swap the Phase 03 fake's storage stub for real `MemoryStorage`, giving every downstream test true adapter semantics for free.
- [ ] **04.3.10** Document reference status — README note per plan §6.2: "MemoryStorage is the reference implementation; the other two must pass the exact same test suite" — and link the contract spec file.

## Feature 04.4 — IndexedDB tier via idb (stores: playlists, channels, groups, epgChannels, epgPrograms, favorites, recent, settings)

The full tier: the plan's eight object stores via the ~1 KB `idb` wrapper — parse once, read forever, cold-boot 90 k channels without touching the network.

- [ ] **04.4.1** Add the dependency — install `idb` at an exact pinned version; it is the repo's first runtime dependency, noted with its ~1 KB cost against the bundle budget.
- [ ] **04.4.2** Define the schema — `src/core/storage/idb-schema.ts`: database `thundertv` v1 with the eight stores and keys from the plan's table — `playlists` by `id`, `channels` by `[playlistId, index]`, `groups` by `[playlistId, name]`, `epgChannels` by id, `epgPrograms` by `[channelId, start]`, `favorites`/`recent` composite, `settings` by key.
- [ ] **04.4.3** Type with `DBSchema` — use `idb`'s `DBSchema` generic bound to the row types from `records.ts` so store names and key paths are compile-checked.
- [ ] **04.4.4** Implement `IdbStorage` — `src/core/storage/idb-storage.ts` fulfilling the full `StorageAdapter` (kv ops mapped onto the `settings`-style keyed access pattern or a dedicated `kv` approach — decide, implement, and note the decision here), `tier: 'full'`.
- [ ] **04.4.5** Add the program time index — an index on `epgPrograms` supporting the plan's range query by `[channelId, start]` (IDBKeyRange between bounds), backing the Phase 16 pruning and Phase 17 now/next reads.
- [ ] **04.4.6** Batch inside transactions — `bulkPut` writes all rows of a chunk in one `readwrite` transaction (single `tx.done` await), never one transaction per row.
- [ ] **04.4.7** Convert failures, don't throw — wrap every operation so `QuotaExceededError`, `InvalidStateError`, and connection-lost errors resolve `{ ok: false, reason }` feeding the Feature 04.7 demotion path.
- [ ] **04.4.8** Handle upgrades and blockers — wire `upgrade`, `blocked`, `blocking`, and `terminated` callbacks: close and reopen on `terminated`, and log one classified diagnostic line (no data in the message).
- [ ] **04.4.9** Run the contract matrix — execute `describeStorageContract(IdbStorage)` under Vitest with the `fake-indexeddb` shim, green with zero tier-specific spec changes.
- [ ] **04.4.10** Manual full-tier smoke — on built `dist/`, write a synthetic 10 k-row `channels` batch via a temporary dev hook, reload, read it back by range, and confirm devtools' IndexedDB inspector shows the expected stores.

## Feature 04.5 — localStorage partial tier (chunked JSON, quota guard, small-data-only policy)

The partial tier persists only the small, valuable data — settings, source definitions, favorites, recent — as chunked, quota-guarded JSON; bulk rows deliberately do not survive a reload here.

- [ ] **04.5.1** Implement `LocalStorageStorage` — `src/core/storage/local-storage-storage.ts`, `tier: 'partial'`, prefixing every key with `tl:` to avoid collisions on shared origins.
- [ ] **04.5.2** Encode the policy in code — a `PERSISTED_TABLES` allowlist (`playlists`, `favorites`, `recent`, `settings`); `bulkPut` to `channels`/`groups`/`epgChannels`/`epgPrograms` succeeds into an in-memory overlay (delegating to an internal `MemoryStorage`) and is simply not persisted — feature behavior stays identical, per the plan.
- [ ] **04.5.3** Guard every write — port `guardedSet` from MASTERPLAN.md §5.7: catch `QuotaExceededError`, return `{ ok: false, reason: 'quota' }`, and let the caller trigger demotion — never white-screen.
- [ ] **04.5.4** Chunk large values — split serialized values above ~64 KB into `tl:<key>#0..n` chunk keys with a manifest entry (count + total length) so reads can detect truncated writes.
- [ ] **04.5.5** Write atomically enough — write chunks first, manifest last; a read finding a manifest/chunk mismatch discards the value (resolves `undefined`) instead of returning a corrupt partial parse.
- [ ] **04.5.6** Budget the tier — track approximate bytes used under the `tl:` prefix and refuse (classified `{ ok: false, reason: 'budget' }`) writes that would exceed the ~5 MB plan budget, before the browser throws.
- [ ] **04.5.7** Serialize denormalized snapshots — verify favorites/recent rows (name, stream URL, logo, group — per the plan's denormalization) survive a reload and are readable before any playlist parse, powering the fast-boot path.
- [ ] **04.5.8** Keep credentials storable but bounded — `playlists` rows (Xtream credentials included) persist here by design; document the residual-risk note and confirm no credential ever appears in a chunk _key_ (keys can end up in error messages).
- [ ] **04.5.9** Run the contract matrix — `describeStorageContract(LocalStorageStorage)` green, plus partial-tier-specific specs: bulk tables readable within the session but empty after a simulated reload (fresh instance), quota write demotes gracefully.
- [ ] **04.5.10** Manual partial-tier smoke — with IDB sabotaged on built `dist/`, add a source + favorites, reload, and confirm sources/favorites survive while the app re-parses bulk data with the documented one-line notice showing.

## Feature 04.6 — Chunked bulk writes (~5000 rows) for channels/EPG

Bulk data streams from the parser workers to storage in ~5000-row chunks written from the main thread — matching the §5.10 worker protocol so a 100 k-channel import never blocks the UI or balloons memory.

- [ ] **04.6.1** Define the chunk contract — `CHUNK_ROWS = 5_000` exported from `src/core/storage/bulk.ts`, referenced by the storage layer now and the Phase 06/16 worker protocols later (one constant, two consumers).
- [ ] **04.6.2** Implement `writeChunked` — `writeChunked(storage, table, rows, keyOf, onProgress)` slicing input into `CHUNK_ROWS` batches, awaiting each `bulkPut` sequentially, and reporting `{ written, total }` after each batch.
- [ ] **04.6.3** Yield between chunks — insert an explicit macrotask yield (`await new Promise(r => setTimeout(r))` or `scheduler.yield()` where available) between batches so input handling and rendering interleave with a large import.
- [ ] **04.6.4** Abort cleanly — accept an `AbortSignal`; an aborted import stops between chunks, reports rows written so far, and leaves storage consistent (whole chunks only, no partial batch).
- [ ] **04.6.5** Stop on failure — a `{ ok: false }` from any `bulkPut` halts the run, propagates the reason (feeding demotion), and never retries blindly into a full quota.
- [ ] **04.6.6** Replace-then-write semantics — provide `replaceTableChunked` (clearTable + writeChunked in order) for playlist re-parse flows, documented as the only sanctioned way to refresh a playlist's `channels` rows.
- [ ] **04.6.7** Keep the main thread honest — profile a synthetic 100 k-row write on the full tier and record longest task duration (target: no main-thread task > 50 ms attributable to storage) against the import budget of < 5 s.
- [ ] **04.6.8** Feed progress to state — `onProgress` is shaped for direct use as `setValue('import.progress', ...)` (plain serializable object), ready for the Phase 07 progress UI without adaptation.
- [ ] **04.6.9** Unit-test chunking — specs for exact chunk boundaries (4 999/5 000/5 001 rows), progress call counts, abort between chunks, and failure halting with correct written-count.
- [ ] **04.6.10** Matrix the bulk path — run the chunked-write specs against all three tiers (memory overlay on partial; real stores elsewhere) inside the storage test matrix.

## Feature 04.7 — Runtime demotion on write failure with session re-probe

The probe can pass and reality still fail later (IDB opens, writes die mid-session). Runtime failures demote the session to a lower tier, keep the app running, and the next boot re-probes fresh.

- [ ] **04.7.1** Build the tier controller — `src/core/storage/tier-controller.ts` owning the active adapter reference and a `demote(reason)` method: full → partial → none, one direction only, never mid-session promotion.
- [ ] **04.7.2** Route failures to it — wire the `{ ok: false }` results from `IdbStorage`/`LocalStorageStorage` writes (and `writeChunked` propagation) into `demote()`, mapping `quota`/`io` reasons to the notice copy.
- [ ] **04.7.3** Swap without dangling writes — demotion drains or discards in-flight chunk queues, replaces the adapter behind the platform accessor atomically, and subsequent calls hit the new tier — callers never hold a direct adapter reference (enforce: everything goes through `getPlatform().storage`, which delegates to the controller).
- [ ] **04.7.4** Carry the hot data across — on demotion, the controller re-persists the small valuable set (settings, playlists meta, favorites, recent) readable from memory into the new tier when that tier persists them, so a full→partial fall keeps snapshots alive.
- [ ] **04.7.5** Update capabilities live — demotion updates `capabilities.durableStorage` through the sanctioned setter from Phase 03 and republishes `storage.tier` state so the notice and any gated UI react immediately.
- [ ] **04.7.6** Session-scoped verdict — record the demotion (reason + timestamp) in memory only; the next boot runs the Feature 04.2 probe from scratch, per the plan's risk table ("demotes for the session and re-probes next boot").
- [ ] **04.7.7** Log once, redacted — demotion emits exactly one structured console diagnostic (tier-from, tier-to, reason) with no keys or values from the failed write in the message.
- [ ] **04.7.8** Unit-test the ladder — specs: full→partial on IDB write failure, partial→none on quota, no promotion, no double-demotion storm when several writes fail concurrently (demotion is idempotent per level).
- [ ] **04.7.9** Test data carry-over — spec asserting favorites/settings written before a forced full→partial demotion are readable after it through the controller.
- [ ] **04.7.10** Manual failure drill — on built `dist/`, force IDB write failures mid-session (devtools protocol or a debug flag that poisons `bulkPut`), and confirm: app keeps running, notice appears, tier state reads `partial`, reload re-probes back to full.

## Feature 04.8 — Storage-mode notice UI (one line, dismissible)

Degraded storage gets exactly one honest, dismissible line — "storage is limited on this device; playlists reload on start" — never a modal, never silence.

- [ ] **04.8.1** Build the notice partial — a single-line strip component in `src/ui/storage-notice.ts` + markup rendered above the view container, styled with tokens (no `--color-danger`; this is informational, not an error).
- [ ] **04.8.2** Gate on tier state — visible via `data-if` on a `computed` over `storage.tier` (`partial` or `none`) and a `ui.storageNoticeDismissed` flag; the full tier never shows it.
- [ ] **04.8.3** Write per-tier copy — two strings in `src/app/strings.ts`: partial ("storage limited on this device — playlists reload on start") and none ("nothing persists on this device — imports last for this session"), phrased from the plan's degradation description.
- [ ] **04.8.4** Cover runtime demotion — a mid-session demotion (Feature 04.7) re-shows the notice even if previously dismissed, because the situation changed; spec this interaction.
- [ ] **04.8.5** Make dismissal an action — `defineFn('dismissStorageNotice')` sets the flag; dismissal persists via `settings` when the active tier can persist it (partial), and is session-only on none — document the asymmetry inline.
- [ ] **04.8.6** No layout jump — the notice occupies a grid row that collapses instantly when hidden; verify the channel-list area does not shift on dismiss (no animation, single relayout).
- [ ] **04.8.7** Keep it accessible — `role="status"` with the icon from the Phase 02 sprite marked decorative, so screen readers announce the mode change once.
- [ ] **04.8.8** Link to detail — the notice text ends with a "learn more" affordance opening the settings panel's (stub) User section where the tier and reason are displayed verbatim from `storage.tier` state.
- [ ] **04.8.9** Unit-test visibility — bindDOM-harness specs: hidden on full, shown on partial with partial copy, shown on none with none copy, hidden after dismiss action, re-shown after a simulated demotion event.
- [ ] **04.8.10** Manual tier walk — view the notice on all three tiers on built `dist/` (using the Feature 04.2 sabotage recipes) and confirm copy, dismissal, and the demotion re-show behave as specified.

## Feature 04.9 — Stored-shape versioning and migration hooks

Every stored shape carries a version from day one, so a later schema change is a migration hook, not a corrupt-read incident — cheap now, priceless in Phase 15+.

- [ ] **04.9.1** Version the envelope — wrap kv values in `{ v: number, data }` at the adapter boundary (`src/core/storage/versioning.ts`), with the current shape version per key family declared in one registry map.
- [ ] **04.9.2** Version table rows — add a `v` field to the row types in `records.ts` for `playlists`, `favorites`, and `recent` (the long-lived, cross-version rows); bulk `channels`/`epgPrograms` rows stay unversioned by design (they are re-parseable caches — document this split).
- [ ] **04.9.3** Define the hook API — `registerMigration(keyFamily, fromV, toV, fn)`; reads encountering an old `v` run the chain, write back the migrated value, and return the current shape.
- [ ] **04.9.4** Fail safe on unknown versions — a `v` _newer_ than the registry (downgraded app) or an unparseable envelope resolves `undefined` plus one redacted diagnostic — never a throw into feature code.
- [ ] **04.9.5** Version the IDB database itself — document the split: `idb`'s native `version`/`upgrade` handles _structural_ changes (new stores/indexes), the envelope handles _shape_ changes within a store; both live in this feature's files.
- [ ] **04.9.6** Seed v1 everywhere — declare version 1 for `settings`, `playlists`, `favorites`, `recent`, and the future session-snapshot keys, so Phase 05's persistence bridge writes versioned data from its first byte.
- [ ] **04.9.7** Keep migrations pure — migration functions are pure `(old) => new` with no storage or platform access; enforce by type signature and spec.
- [ ] **04.9.8** Unit-test the chain — specs: v1→v3 runs two hooks in order, write-back occurs once, missing intermediate hook surfaces a registry-time error (not a read-time surprise), newer-version reads resolve `undefined`.
- [ ] **04.9.9** Test across tiers — versioning specs run inside the matrix so envelope behavior is identical on IDB, localStorage (including chunked values), and memory.
- [ ] **04.9.10** Document the playbook — README section: how to change a stored shape (bump registry, add hook, add fixture spec with a captured old-shape blob), and the rule that hooks are never deleted while any supported version can produce their input.

## Feature 04.10 — Storage test matrix (identical suite running against all three tiers)

The phase's proof: one behavioral suite, three adapters, zero per-tier spec forks — plus the fixtures and CI-less local gates that keep it that way.

- [ ] **04.10.1** Finalize the matrix runner — `src/core/storage/storage-matrix.spec.ts` invoking `describeStorageContract` for `MemoryStorage`, `IdbStorage` (over `fake-indexeddb`), and `LocalStorageStorage` (over a jsdom localStorage), each in an isolated `describe` with fresh instances per test.
- [ ] **04.10.2** Pin the shims — add `fake-indexeddb` as a pinned devDependency and document why the matrix runs on shims locally while manual smokes cover real engines (no Actions, per the distribution model).
- [ ] **04.10.3** Cover the bulk path — matrix includes the `writeChunked`/`replaceTableChunked` specs from 04.6 with a 12 000-row fixture (three chunks) asserting counts, ordering, and range reads per tier.
- [ ] **04.10.4** Cover the partial-tier policy — tier-_behavioral_ differences (bulk tables not surviving an instance recreate on partial; nothing surviving on none) are expressed as matrix parameters (`survivesReload: boolean` per table), not as forked specs.
- [ ] **04.10.5** Cover versioning and demotion — envelope migration specs and the tier-controller ladder specs run inside the same `npm test` invocation so the whole engine gates together.
- [ ] **04.10.6** Build shared fixtures — `src/core/storage/fixtures.ts` with generators for channel rows, EPG programs (sorted by start), and denormalized favorite snapshots, reused later by the Phase 06/16 worker tests.
- [ ] **04.10.7** Assert clone isolation everywhere — the matrix mutates every returned object and re-reads to prove no tier leaks references (the `structuredClone` contract from 04.3.3).
- [ ] **04.10.8** Keep the suite fast — full matrix under ~10 s locally; if a tier's suite exceeds it, profile and note the cause here rather than trimming coverage.
- [ ] **04.10.9** Wire the gate — `npm test` runs the matrix by default; the README verification checklist gains "storage matrix green" as a standing item for every future storage-touching phase.
- [ ] **04.10.10** Close the phase — run the standing checklist (build, typecheck, lint, matrix, budgets), perform the three-tier manual smoke on the deployed Pages URL, record evidence per tier in this file, check the `> Verification:` line, and merge `feature/phase-04-tiered-storage-engine`.
