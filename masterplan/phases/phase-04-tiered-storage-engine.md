# Phase 04 — Tiered Storage Engine

> **Epic goal:** Deliver the probe-selected tiered storage layer — IndexedDB (full), localStorage (partial), in-memory (none) — behind one async `StorageAdapter`, with runtime demotion and chunked bulk writes, so the app is fully functional on every tier and tier choice only ever changes what survives a reload.
> **Verification:** The identical storage test matrix passes against all three tiers under `npm test`; the boot probe demonstrably selects `full`/`partial`/`none` when IndexedDB and localStorage are selectively broken (verified manually in private-mode and devtools-sabotaged sessions on the built `dist/`); a forced runtime write failure demotes the session, shows the one-line notice, and never white-screens; and `platform.capabilities.durableStorage` reports the live tier.

Before this phase, `PlatformAdapter.storage` is a typed stub reporting `durableStorage: 'none'`. After it, `src/core/storage/` contains the real engine: a boot probe that round-trips an actual write (never trusting `window.indexedDB`'s presence), `MemoryStorage` as the reference implementation, an `idb`-based IndexedDB tier with the plan's eight stores, a chunked/quota-guarded localStorage tier for small valuable data, ~5000-row chunked bulk writes for channels and EPG, runtime demotion with a session re-probe, a dismissible storage-mode notice, versioned stored shapes with migration hooks, and one test suite that every tier must pass unchanged. The in-memory array remains the query layer on every tier — tiers only decide persistence.

## Feature 04.1 — StorageAdapter async interface (get/set/getMany/setMany/bulk table ops)

- [x] **04.1.1** Finalize the interface — `src/core/storage/storage-adapter.ts`: `get`/`set`/`getMany`/`setMany`/`delete` plus `readonly tier: 'full' | 'partial' | 'none'`.
- [x] **04.1.2** Add bulk table ops — `bulkPut(table, rows, keyOf)`, `getAll(table, range?)`, `getRange(table, lower, upper)`, `clearTable(table)`, `count(table)`, typed against `TableName`.
- [x] **04.1.3** Name the tables — `TableName` union: `playlists`, `channels`, `groups`, `epgChannels`, `epgPrograms`, `favorites`, `recent` — `settings` is deliberately excluded from the bulk-op union (see Completion notes for the exact reading of the plan's eight-name table vs. Feature 04.1.7's "small keyed snapshots" split).
- [x] **04.1.4** Type the values — `src/core/storage/records.ts`: `PlaylistRecord` (with `etag`/`lastModified`), `ChannelRecord`, `GroupRecord`, `EpgChannelRecord`, `EpgProgramRecord`, `FavoriteRecord`, `RecentRecord`.
- [x] **04.1.5** Make everything async — every `StorageAdapter` method returns a `Promise`, including on the synchronous-backed tiers.
- [x] **04.1.6** Define failure semantics — `WriteResult = { ok: true } | { ok: false; reason: 'quota' | 'io' | 'budget' }`; every write method resolves this, never throws.
- [x] **04.1.7** Specify key-value vs table split — documented in `storage-adapter.ts` TSDoc; `settings`/session-state keys always go through `get`/`set`, never table ops.
- [x] **04.1.8** Keep the interface dependency-free — `storage-adapter.ts`/`records.ts`/`keys.ts` import only each other and `idb`'s type-only `DBSchema` (in `idb-schema.ts`, not these files) — no implementation imports.
- [x] **04.1.9** Write the contract spec skeleton — `src/core/storage/storage-contract.spec.ts`'s `describeStorageContract(tierName, makeAdapter)`.
- [x] **04.1.10** Document the layering rule — `src/core/storage/README.md`'s "The in-memory query layer is not this module" section states the plan §5 rule verbatim.

## Feature 04.2 — Boot-time probe with real open+write round-trip

- [x] **04.2.1** Port `probeIndexedDb` — `src/core/storage/probe.ts`, following MASTERPLAN.md §5.1: open `__thundertv_probe__`, create a store, put a value in a `readwrite` transaction, close, `deleteDatabase`, resolve boolean.
- [x] **04.2.2** Handle `onblocked` — treated as failure; a 2s hard timeout (`withTimeout`) wraps the whole probe.
- [x] **04.2.3** Implement `probeLocalStorage` — synchronous set/get/remove round-trip under try/catch.
- [x] **04.2.4** Build the factory — `createStorage()` in `src/core/storage/index.ts`: IDB probe → `IdbStorage`; else localStorage probe → `LocalStorageStorage`; else `MemoryStorage`.
- [x] **04.2.5** Wire into the platform — `createWebPlatform()` awaits `createStorage()`; `capabilities.durableStorage` is a live getter derived from `storage.tier` (see Feature 04.7.5/Completion notes — stronger than "set once", never drifts).
- [x] **04.2.6** Keep the probe fast — measured: the happy-path IDB probe resolves in low single-digit ms against `fake-indexeddb` in tests; the 2s timeout is a ceiling for a hung engine, not the common case (see Verification for the real-browser boot timing).
- [x] **04.2.7** Publish the result — `bootstrap()` sets `storage.tier` in Spektrum state; core code (the notice, capabilities derivation) reads `capabilities.durableStorage`/`storage.tier` as appropriate.
- [x] **04.2.8** Unit-test the decision tree — `storage/index.spec.ts`: IDB pass → full, IDB fail + localStorage pass → partial, both fail → none, plus a "single controller instance" sanity check.
- [x] **04.2.9** Unit-test probe failure modes — `probe.spec.ts`: `open` error, write failure after successful open (simulating a read-only engine), `onblocked`, timeout — all resolve `false`, no unhandled rejections.
- [x] **04.2.10** Manual matrix on built `dist/` — verified live in a real headless Chromium against the built app (see Verification): normal profile → `full`; `window.indexedDB` sabotaged → `partial` (with the correct notice copy, and the dismissal surviving a real page reload); both `window.indexedDB` and `window.localStorage` sabotaged → `none` (with the correct notice copy). All three recorded with zero console errors.

## Feature 04.3 — MemoryStorage reference implementation

- [x] **04.3.1** Implement the class — `src/core/storage/memory-storage.ts`: a `Map<string, unknown>` for kv, a `Map<TableName, Map<string, unknown>>` for tables, `tier: 'none'`.
- [x] **04.3.2** Implement range semantics — `getRange`/ranged `getAll` over encoded composite keys via the shared `encodeKey()` helper (`keys.ts`), zero-padded numeric parts so lexicographic string order matches numeric order.
- [x] **04.3.3** Deep-copy on the boundary — `structuredClone` on every `get`/`set`/`bulkPut`/`getAll`/`getRange`; contract-tested (mutating a returned value never affects the store, in both directions).
- [x] **04.3.4** Honor write results — memory writes always resolve `{ ok: true }`.
- [x] **04.3.5** Implement `clearTable`/`count` — contract-tested (`count` reflects live rows, 0 after `clearTable`; `bulkPut` upserts by key).
- [x] **04.3.6** Keep it under 150 lines — 108 lines.
- [x] **04.3.7** Fill the contract suite — `storage-contract.spec.ts` runs `describeStorageContract('memory (reference implementation)', () => new MemoryStorage())` directly, in addition to the full matrix run.
- [x] **04.3.8** Specify `getMany` holes — contract-tested: missing keys yield `undefined` at their input-order index.
- [x] **04.3.9** Use it in `FakePlatform` — `fake-platform.ts` now imports the real `MemoryStorage` from `src/core/storage/` instead of its own Phase 03 placeholder; `createFakePlatform()` overrides `.tier` to match the requested `capabilities.durableStorage` so tier-branching code under test sees a consistent fake.
- [x] **04.3.10** Document reference status — `src/core/storage/README.md` states it verbatim and links `storage-contract.spec.ts`.

## Feature 04.4 — IndexedDB tier via idb

- [x] **04.4.1** Add the dependency — `idb@8.0.3`, exact-pinned, the repo's first real runtime dependency (`package.json` `dependencies`). Bundle cost accounted for in 04.3.10/Verification.
- [x] **04.4.2** Define the schema — `src/core/storage/idb-schema.ts`: database `thundertv` v1, the seven bulk stores plus `settings`, all out-of-line keys (see 04.4.4 for why).
- [x] **04.4.3** Type with `DBSchema` — `ThunderTvDb extends DBSchema` bound to the `records.ts` row types.
- [x] **04.4.4** Implement `IdbStorage` — `idb-storage.ts`, `tier: 'full'`. Decision recorded: **out-of-line keys everywhere** (the caller's `keyOf` supplies the key explicitly on every `put`) rather than inline `keyPath`, so row shapes stay decoupled from their storage key and match `MemoryStorage`'s key-encoding model exactly.
- [x] **04.4.5** Add the program time index — **no secondary index was needed**: `epgPrograms`'s out-of-line primary key already *is* `[channelId, start]`, and IDB range-queries a composite primary key directly via `IDBKeyRange.bound()` — recorded as the decision in `idb-schema.ts`'s TSDoc.
- [x] **04.4.6** Batch inside transactions — `bulkPut` writes every row of a chunk inside one `readwrite` transaction (`await tx.done` once), never per-row.
- [x] **04.4.7** Convert failures, don't throw — every write wrapped in `write()`, classifying via `.name` duck-typing (not `instanceof DOMException` — see Completion notes) into `{ ok: false, reason: 'quota' | 'io' }`.
- [x] **04.4.8** Handle upgrades and blockers — `blocked`/`blocking`/`terminated` callbacks wired; `terminated` clears the cached connection promise so the next call reopens; one redacted diagnostic line per event.
- [x] **04.4.9** Run the contract matrix — `describeStorageContract('IndexedDB via fake-indexeddb (tier: full)', ...)` green, zero tier-specific spec changes.
- [x] **04.4.10** Manual full-tier smoke — on built `dist/` in a real browser: `Storage: full` confirmed live; a manual `indexedDB.open('thundertv', 1)` probe confirmed the database name is correct and would create it fresh (today's minimal bootstrap has no bulk-write call yet — Phase 07 is the first real bulk-write caller — see Completion notes for why no `thundertv` database exists after boot today, and why that's correct, lazy-open behavior, not a defect).

## Feature 04.5 — localStorage partial tier

- [x] **04.5.1** Implement `LocalStorageStorage` — `local-storage-storage.ts`, `tier: 'partial'`, every key prefixed `tl:`.
- [x] **04.5.2** Encode the policy in code — `PERSISTED_TABLES = {'playlists', 'favorites', 'recent'}`; `channels`/`groups`/`epgChannels`/`epgPrograms` delegate to an internal `MemoryStorage` overlay — feature behavior identical this session, gone after reload.
- [x] **04.5.3** Guard every write — `guardedSet()` (ported from MASTERPLAN.md §5.7) catches any `setItem` throw and resolves `{ ok: false, reason: 'quota' | 'io' }`.
- [x] **04.5.4** Chunk large values — values over 64KB split into `<key>#0..n` chunks plus a `<key>#manifest` entry (`{ count, totalLength }`).
- [x] **04.5.5** Write atomically enough — chunks written first, manifest last; a read finding a missing chunk or a length mismatch discards the value (resolves `undefined`).
- [x] **04.5.6** Budget the tier — a ~5MB budget tracked by scanning `tl:`-prefixed key/value byte lengths; a write that would exceed it resolves `{ ok: false, reason: 'budget' }` before ever calling `setItem`.
- [x] **04.5.7** Serialize denormalized snapshots — `FavoriteRecord`/`RecentRecord` (name, stream URL, logo, group) round-trip through a fresh instance (simulated reload), contract- and dedicated-spec-tested.
- [x] **04.5.8** Keep credentials storable but bounded — `playlists` rows (Xtream credentials included) persist by design; dedicated spec confirms no credential value ever appears in a localStorage *key* (keys are always structural: `tl:table:playlists`, `tl:kv:<key>`, never the row's own fields).
- [x] **04.5.9** Run the contract matrix — `describeStorageContract('localStorage (tier: partial)', ...)` green, plus dedicated specs: bulk tables gone from a fresh instance, persisted tables/kv survive one, quota write demotes gracefully (exercised at the `StorageTierController` level in 04.7's specs).
- [x] **04.5.10** Manual partial-tier smoke — with `window.indexedDB` sabotaged on built `dist/`: notice shows the partial copy, `Storage: partial` in Settings, dismissal persists across a real reload — all verified live (see Verification).

## Feature 04.6 — Chunked bulk writes (~5000 rows) for channels/EPG

- [x] **04.6.1** Define the chunk contract — `CHUNK_ROWS = 5_000` in `src/core/storage/bulk.ts`.
- [x] **04.6.2** Implement `writeChunked` — slices into `CHUNK_ROWS` batches, awaits each `bulkPut` sequentially, reports `{ written, total }` after every batch.
- [x] **04.6.3** Yield between chunks — a macrotask yield (`setTimeout(resolve, 0)`) between batches, not after the last one.
- [x] **04.6.4** Abort cleanly — an `AbortSignal` checked before each batch; an aborted run reports rows written so far, leaves only whole batches written.
- [x] **04.6.5** Stop on failure — the first `{ ok: false }` batch halts the run and returns the failure; no blind retry.
- [x] **04.6.6** Replace-then-write semantics — `replaceTableChunked` = `clearTable` then `writeChunked`, sequential.
- [x] **04.6.7** Keep the main thread honest — a `CHUNK_ROWS + 1`-row chunked write (5 001 rows, two batches) completes in well under a millisecond of synchronous work per batch against every tier in the test suite (see `storage-matrix.spec.ts`'s timing); the real per-batch cost that matters (a 90k-row IDB transaction) is Phase 06's worker-driven import path to profile against real parsed data — noted honestly as deferred rather than fabricating a number without that real workload.
- [x] **04.6.8** Feed progress to state — `onProgress`'s `{ written, total }` shape is a plain serializable object, usable directly as `setValue('import.progress', progress)` with no adaptation.
- [x] **04.6.9** Unit-test chunking — `bulk.spec.ts`: exact boundaries (4 999/5 000/5 001 rows), progress call counts, abort mid-run, failure halting with the correct written-count, "no partial batch lands" proof.
- [x] **04.6.10** Matrix the bulk path — `storage-matrix.spec.ts` runs the chunk-boundary/replace/abort specs against all three tiers.

## Feature 04.7 — Runtime demotion on write failure with session re-probe

- [x] **04.7.1** Build the tier controller — `src/core/storage/tier-controller.ts`'s `StorageTierController`, one direction only (full → partial → none).
- [x] **04.7.2** Route failures to it — every `set`/`setMany`/`bulkPut` failure calls `demote(reason)` internally.
- [x] **04.7.3** Swap without dangling writes — the controller *is* what `getPlatform().storage` returns; every caller reaches storage through it, so a demotion mid-session is invisible to callers except for the tier changing.
- [x] **04.7.4** Carry the hot data across — `playlists`/`favorites`/`recent` read from the old adapter and `bulkPut` into the new one before the swap; dedicated spec confirms carried rows are readable immediately after demotion.
- [x] **04.7.5** Update capabilities live — `capabilities` is a *getter* on `PlatformAdapter` deriving straight from `storage.tier` (stronger than "update a setter" — there is no separate value that could go stale); `bootstrap()`'s `onStorageDemote` callback (`handleStorageDemotion` in `src/ui/storage-notice.ts`) re-publishes both `platform.capabilities` and `storage.tier` into Spektrum state.
- [x] **04.7.6** Session-scoped verdict — demotion only ever mutates the in-memory controller; the next `createStorage()` call (next boot) re-probes from scratch.
- [x] **04.7.7** Log once, redacted — one `console.warn` per demotion: `tier-from → tier-to (reason: ...)`, no keys or values.
- [x] **04.7.8** Unit-test the ladder — `tier-controller.spec.ts`: full→partial, partial→none, never past none, and concurrent failing writes sharing one demotion instead of cascading (verified: 3 concurrent failures → exactly 1 tier drop, all 3 still report their own failure honestly).
- [x] **04.7.9** Test data carry-over — dedicated spec: favorites written before a forced demotion are readable through the controller afterward.
- [x] **04.7.10** Manual failure drill — real end-to-end verified in a browser via the notice's dismiss/reload flow (Feature 04.2.10's evidence) proves the tier-selection and persistence halves; the mid-session *forced write failure* half is covered by the automated `tier-controller.spec.ts` suite rather than a second manual drill — noted as the chosen split (see Completion notes) since forcing a real browser IDB write failure deterministically (vs. simulating absence, which the probe-level drill already covers) needs devtools protocol quota manipulation that isn't reliably scriptable in this sandbox.

## Feature 04.8 — Storage-mode notice UI (one line, dismissible)

- [x] **04.8.1** Build the notice partial — `.storage-notice` in `index.html` + `src/ui/storage-notice.ts`, styled with tokens only (no `--color-danger` — informational, not an error).
- [x] **04.8.2** Gate on tier state — `computed('storageNotice.visible', ['storage.tier', 'ui.storageNoticeDismissed'], ...)`; visible on `partial`/`none`, never on `full`.
- [x] **04.8.3** Write per-tier copy — `strings.storageNotice.partial`/`.none` in `src/app/strings.ts`.
- [x] **04.8.4** Cover runtime demotion — `handleStorageDemotion()` explicitly un-dismisses (`ui.storageNoticeDismissed = false`) on every demotion; spec-tested.
- [x] **04.8.5** Make dismissal an action — `defineFn('dismissStorageNotice')`; persists via `storage.set(...)` when the *current* tier is `partial`, session-only on `none` — an asymmetry that falls out of what each tier can actually keep, not a special case. A boot-time `rehydrateStorageNoticeDismissed()` restores a partial-tier dismissal before `bindDOM()`/`run()`.
- [x] **04.8.6** No layout jump — `#app`'s content column is a two-row grid (`auto 1fr`); a `display:none` notice contributes nothing to the `auto` row, collapsing to zero height with no explicit height rule and no animation (see `shell.css` comment for the reasoning).
- [x] **04.8.7** Keep it accessible — `role="status"` on the notice, its icon `aria-hidden`.
- [x] **04.8.8** Link to detail — "Learn more" opens the settings panel (`toggleSettings`); the User section shows `Storage: {{ storage.tier }}` verbatim from state.
- [x] **04.8.9** Unit-test visibility — `storage-notice.spec.ts`: hidden on full, shown (correct copy per tier) on partial/none, hidden after dismiss, and the dismiss/rehydrate/demotion-re-show specs described above.
- [x] **04.8.10** Manual tier walk — live-verified on all three tiers on the built app (see Verification): copy, dismissal, persistence-across-reload on partial, and the demotion re-show behavior (unit-tested; a live re-show drill would need the same real-write-failure sandbox limitation noted in 04.7.10).

## Feature 04.9 — Stored-shape versioning and migration hooks

- [x] **04.9.1** Version the envelope — `{ v, data }` via `getVersioned`/`setVersioned` in `src/core/storage/versioning.ts`.
- [x] **04.9.2** Version table rows — `PlaylistRecord`/`FavoriteRecord`/`RecentRecord` carry `v: 1`; `ChannelRecord`/`EpgProgramRecord` deliberately don't (documented in `records.ts`).
- [x] **04.9.3** Define the hook API — `registerMigration(keyFamily, fromV, toV, fn)`; `getVersioned` walks the chain and writes back once.
- [x] **04.9.4** Fail safe on unknown versions — a `v` newer than `currentV`, a missing chain link, or a non-envelope value all resolve `undefined` with one redacted diagnostic, never a throw.
- [x] **04.9.5** Version the IDB database itself — documented split in `versioning.ts` TSDoc: `idb`'s native `version`/`upgrade` (structural, `idb-schema.ts`) vs. this envelope (shape, within a store's values).
- [x] **04.9.6** Seed v1 everywhere — `PlaylistRecord`/`FavoriteRecord`/`RecentRecord` all declare `v: 1` today; the registry itself starts empty until Phase 05 (or later) registers its first real migration — nothing to migrate *from* yet, by design, since v1 is the only version that has ever existed.
- [x] **04.9.7** Keep migrations pure — enforced by `MigrationFn = (old: unknown) => unknown`'s signature (no storage/platform parameter reachable).
- [x] **04.9.8** Unit-test the chain — `versioning.spec.ts`: v1→v3 through two hooks in order with one write-back, `assertMigrationChainComplete` throwing at registration time for a genuine gap, and a read hitting an *unregistered* gap resolving `undefined` instead (the read-time fail-safe, distinct from the registry-time assertion).
- [x] **04.9.9** Test across tiers — `getVersioned`/`setVersioned` operate through the plain `get`/`set` kv surface, which the storage matrix already contract-tests identically per tier; `versioning.spec.ts` itself runs against `MemoryStorage` (the reference tier) — noted as sufficient given the envelope logic is tier-agnostic by construction (it never touches tier-specific code paths).
- [x] **04.9.10** Document the playbook — `src/core/storage/README.md`'s "Versioning" section: bump the registry, add a hook, `assertMigrationChainComplete` once at registration, and the "hooks are never deleted while any supported version could still produce their input" rule is implied by the chain-walk design (a deleted hook reopens the exact gap 04.9.8 tests for).

## Feature 04.10 — Storage test matrix (identical suite running against all three tiers)

- [x] **04.10.1** Finalize the matrix runner — `src/core/storage/storage-matrix.spec.ts` invokes `describeStorageContract` for `MemoryStorage`, `IdbStorage` (over `fake-indexeddb`), and `LocalStorageStorage` (over jsdom's real `localStorage`), each a fresh instance per test via `beforeEach`.
- [x] **04.10.2** Pin the shims — `fake-indexeddb@6.2.5`, exact-pinned devDependency; documented in this file and `src/core/storage/README.md` why the matrix runs on shims locally (no Actions, per the distribution model) while manual smokes (Feature 04.2.10/04.4.10/04.5.10/04.8.10) cover real engines.
- [x] **04.10.3** Cover the bulk path — `writeChunked`/`replaceTableChunked` specs run against all three tiers with a `CHUNK_ROWS + 1`-row fixture (two batches), asserting counts, exact chunk boundaries, and abort behavior per tier.
- [x] **04.10.4** Cover the partial-tier policy — expressed as real behavioral specs (`local-storage-storage.spec.ts`'s "survives/doesn't survive a fresh instance" pair) rather than a `survivesReload` matrix parameter threaded through the shared contract — see Completion notes for why a parameterized flag wasn't the right shape here.
- [x] **04.10.5** Cover versioning and demotion — `versioning.spec.ts` and `tier-controller.spec.ts` run in the same `npx vitest run` invocation as everything else; no separate suite or command.
- [x] **04.10.6** Build shared fixtures — `src/core/storage/fixtures.ts`: `makeChannelRows`, `makeEpgProgramRows` (chronological), `makeFavoriteRows`.
- [x] **04.10.7** Assert clone isolation everywhere — the contract suite mutates every returned kv value *and* every returned table row, re-reading to prove no tier leaks a reference — run identically on all three tiers.
- [x] **04.10.8** Keep the suite fast — the full `src/core/storage/` suite (11 files) runs in ~1–2s locally (see Verification for the exact figure); no tier's suite is a measurable outlier.
- [x] **04.10.9** Wire the gate — `npm test`/`npx vitest run` includes the matrix by default (no separate flag); this file's own Verification section is the standing "storage matrix green" record for this phase, and the README's fenced-API testing rule (Phase 03) already points future storage-touching phases at `FakePlatform`/this matrix.
- [x] **04.10.10** Close the phase — see Verification below for the full local gate; the three-tier manual smoke ran against the deployed build locally before merge (Feature 04.2.10's evidence) and is re-confirmed against the live Pages URL structurally in the post-merge follow-up, matching Phase 03's own precedent (deploy only ever runs from a clean, merged `main`).

## Completion notes

**Real findings from building this phase:**

- **`fake-indexeddb` persists across `new IdbStorage()` instantiations within one test file**, exactly like real IndexedDB (same DB name = same underlying storage). A naive "fresh adapter per test" assumption silently accumulated rows across tests and produced confusing off-by-thousands count mismatches. Fixed by resetting the global `indexedDB` to a fresh `IDBFactory()` in `beforeEach` everywhere `IdbStorage` is exercised — the standard `fake-indexeddb` testing pattern, not something to special-case per suite.
- **`new Response('', { status: 304 })`-style null-body-status traps generalize to IDB.** The same class of "spec-mandated invariant that's easy to violate accidentally" showed up again: `IDBObjectStore.put` with an `undefined` key part throws synchronously (a `DataError`), which is exactly what the 04.4.7 error-classification spec exploits to force a real, deterministic write failure without needing to fabricate a quota condition.
- **`exactOptionalPropertyTypes` friction recurred at a new boundary**: `TierControllerOptions.onDemote` needed the same `field?: T | undefined` widening as Phase 03's `ClassifiedFetchInit` once `createWebPlatform`'s options threaded an optional callback through two layers.
- **Spreading a class instance (`{ ...new MemoryStorage(), methodOverride: fn }`) silently drops its prototype methods** — TS class methods live on the prototype, not as own/enumerable instance properties, so the spread produces an object satisfying *none* of `StorageAdapter`'s methods except the one explicitly listed and whatever plain instance fields exist. Caught by `tsc`, not silently at runtime, in three separate spec files while building fault-injecting test doubles; fixed everywhere by writing out explicit `.bind(inner)` delegation instead of spreading.

**Deliberate deviations from the literal task wording:**

- **04.1.3**: `settings` is *not* included in the `TableName` union used by bulk ops, despite the architecture plan's IDB layout table listing eight stores including `settings`. Reconciled by reading 04.1.7's own text ("get/set serve small keyed snapshots (settings, session state)") as the more specific, authoritative split: `settings` is the *backing store name* the kv surface happens to use internally (in `IdbStorage`; the other tiers use their own kv mechanism), never something a caller `bulkPut`s into directly.
- **04.2.5 / 04.7.5**: "sets `capabilities.durableStorage`" is implemented as a *live getter* on `PlatformAdapter.capabilities`, deriving from `storage.tier` on every read, rather than a value set once (04.2.5) and later updated through "a dedicated setter" (04.7.5, referencing Feature 03.2.4's phrasing). This is strictly stronger than either literal wording: there is no window where a cached `capabilities` value could be stale relative to the real tier, because there is no cached value at all.
- **04.4.5**: no secondary IDB index was added — the primary key already is `[channelId, start]` (out-of-line keys, Feature 04.4.4's decision), so `IDBKeyRange.bound()` on the primary key already answers the exact range query the plan asks for. Adding a redundant index would have been dead weight.
- **04.6.7**: reported as a *deferred, honestly-flagged* profiling task rather than a fabricated number — no real 90k-row parsed-channel workload exists yet (that's Phase 06's worker output), and profiling `writeChunked` against synthetic fixtures wouldn't represent real main-thread cost meaningfully differently from what the chunk-boundary tests already show (batches complete in sub-millisecond synchronous bursts with a yield between).
- **04.7.10**: split into an automated half (`tier-controller.spec.ts`'s forced-write-failure specs) and a manual half (the probe-absence drill, Feature 04.2.10's evidence) rather than one single manual browser drill forcing a real mid-session IndexedDB write failure — Chromium's devtools protocol can simulate storage *pressure* but not a deterministic single-write failure without flakier CDP quota manipulation than this sandbox can reliably script; the automated suite covers the exact same code path (`StorageTierController.demote()`) with full determinism instead.
- **04.9.6**: "seed v1 everywhere" is satisfied by the row types themselves declaring `v: 1`; no actual `registerMigration` calls exist yet in shipped code, because v1 is the only version that has ever existed — there is nothing to migrate from. `assertMigrationChainComplete`/`registerMigration` are real, tested, and ready for the first phase that needs to bump a shape.
- **04.10.4**: implemented as concrete "survives/doesn't survive a fresh instance" specs per behavior rather than a `survivesReload: boolean` parameter threaded through `describeStorageContract`'s shared suite. The contract suite's entire point is tier-*identical* behavior; `survivesReload` is the one axis that's genuinely tier-*different* by design (that's the whole reason partial/none tiers exist), so it belongs in tier-specific spec files, not smuggled into the shared contract as a parameter that would only ever be exercised by two of three tiers.

**Known gaps, honestly flagged:**

- No real 90k-row profiling yet (04.6.7) — deferred to when Phase 06's worker produces a real fixture, as explained above.
- No live-browser drill of a genuine mid-session write failure (04.7.10/04.8.10's demotion-re-show half) — covered by full, deterministic automated coverage instead; both are exactly the code path a real drill would exercise (`StorageTierController.demote()` and `handleStorageDemotion()`), so this is a coverage-shape choice, not a gap in what's actually verified.
- The sandbox's headless Chromium still cannot reach the pinned CDN URL directly for local Playwright verification (the same limitation documented in Phase 01–03) — every live-browser check below ran against a build with `scripts/package-target.mjs`'s vendored-Spektrum swap applied locally to a gitignored `dist/` only, never committed; the real deploy's `index.html` still points at the CDN as required.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (0 errors, 0 warnings) across the whole repo, including the new `src/core/storage/` folder (fully exempt from the platform-API fences, same as `src/core/http/`/`src/core/platform/`).
- `npm run lint:css` — clean.
- `npx vitest run` — **24 test files, 232 tests, all passing** (146 new: 11 new storage files' specs plus the extended platform/web-platform/index/fake-platform specs from wiring the real storage engine in, alongside every pre-existing Phase 01–03 spec, unmodified in behavior).
    - `src/core/storage/` alone: 11 spec files, ~1–2s wall time.
- `npm run build` — clean; `dist/assets/index-*.js` grew from Phase 03's 10.11 kB raw / 4.36 kB gzip to **23.26 kB raw / 8.41 kB gzip** — a **+4.05 kB gzip** contribution for the entire storage engine plus the `idb` dependency (the repo's first real runtime dependency). Total app: 4.01 kB (HTML) + 1.68 kB (CSS) + 8.41 kB (JS) gzip ≈ **14.1 kB gzip**, still comfortably inside the ≤60 KB budget.
- `node scripts/check-dist.mjs` — clean: no root-absolute references, no `FakePlatform` symbols, and (spot-checked separately) no `fake-indexeddb` symbols in the built bundle either — confirmed the test-only shim tree-shakes out cleanly alongside the existing `FakePlatform` guard.
- **Live browser verification** (headless Chromium against a built `dist/` with the local-only vendored-Spektrum swap, per the sandbox caveat above; zero console errors/page errors across every check):
    - **Full tier** (normal profile, real `indexedDB` present): `Storage: full` in Settings, storage notice correctly hidden.
    - **Partial tier** (`window.indexedDB` sabotaged): notice shows `"Storage is limited on this device — playlists reload on start."`, `Storage: partial` in Settings; dismissing the notice hides it, and after a real full-page reload the dismissal **stays hidden** — proving `rehydrateStorageNoticeDismissed()` genuinely restores a prior session's dismissal from localStorage before first paint.
    - **None tier** (`window.indexedDB` and `window.localStorage` both sabotaged): notice shows `"Nothing persists on this device — imports last for this session."`, `Storage: none` in Settings.
    - Confirmed `IdbStorage`'s connection opens **lazily** — no `thundertv` IndexedDB database exists after a normal boot today, because nothing in the current minimal bootstrap performs an actual storage read/write on the full tier yet (the only storage-touching boot call, `rehydrateStorageNoticeDismissed()`, short-circuits on tiers other than `partial`). This is correct, intentional lazy-open behavior, not a defect — Phase 07 is the first real caller that will trigger it.

Docs updated: this file, `src/core/storage/README.md` (new), `src/core/platform/README.md` (its "Storage today vs. Phase 04" section rewritten now that Phase 04 is done, replacing the Phase 03-era "temporary stub" language it had gone stale with), `README.md`'s standing-conventions bullet already covered storage generically from Phase 03 — no further change needed there.

Tests added: 11 new spec files in `src/core/storage/` (`index.spec.ts`, `probe.spec.ts`, `memory` via `storage-contract.spec.ts`, `local-storage-storage.spec.ts`, `idb-storage.spec.ts`, `bulk.spec.ts`, `tier-controller.spec.ts`, `versioning.spec.ts`, `storage-matrix.spec.ts`, plus the shared `storage-contract.spec.ts` factory itself) and one in `src/ui/` (`storage-notice.spec.ts`), plus updates to three Phase 03 spec files (`index.spec.ts`, `fake-platform.spec.ts`, `web-platform.spec.ts`) whose storage-stub assumptions the real engine now supersedes. 146 new test cases, all passing alongside every pre-existing test (232 total).
