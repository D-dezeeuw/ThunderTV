# Tiered storage engine

One `StorageAdapter` interface, three implementations, selected by a
boot-time probe — never by feature-detecting global presence (masterplan
§5.1):

```
createStorage()
  ├─ probeIndexedDb()   real open + write + delete round-trip
  │    └─ passes → IdbStorage           (tier: 'full')
  ├─ probeLocalStorage() real set/get/remove round-trip
  │    └─ passes → LocalStorageStorage  (tier: 'partial')
  └─ otherwise           → MemoryStorage (tier: 'none')

  → wrapped in one StorageTierController, which is what
    getPlatform().storage actually is.
```

`MemoryStorage` is the reference implementation — `storage-contract.spec.ts`
defines the full behavioral suite once, and `storage-matrix.spec.ts` runs it
against all three tiers unchanged. If a tier ever needs a test the others
don't, that's a sign the contract is leaking a tier-specific concern; fix
the contract or the adapter, not the test.

## Two surfaces, never mixed

- `get`/`set`/`getMany`/`setMany`/`delete` — small keyed snapshots
  (individual settings, session state). Every value round-trips through
  `structuredClone` on both read and write (`MemoryStorage`) or JSON
  (the other two) — mutating a value you got back from `get()` never
  affects what's stored.
- `bulkPut`/`getAll`/`getRange`/`clearTable`/`count` — bulk table rows
  (`playlists`, `channels`, `groups`, `epgChannels`, `epgPrograms`,
  `epgCatalog`, `favorites`, `recent`). `channels`/`epgPrograms`/`epgCatalog`
  rows are unversioned — they're re-parseable caches, never long-lived user
  data.

Every write resolves `{ ok: true } | { ok: false, reason }` — never throws.
A `{ ok: false }` result is what drives tier demotion (below); nothing else
needs to inspect `reason` directly.

## The in-memory query layer is not this module

Per the architecture plan: the active playlist's channels always live in a
plain module-level array too, and that array — not a repeated `getAll()` —
is what search/filter/virtual-scroll actually query. Storage tiers only
decide what survives a reload; they are never the hot read path for a
90k-row list. That array lives in `src/m3u/channel-memory.ts` (stubbed in
Phase 05, built out in Phase 06), never in Spektrum state — see
`src/state/README.md`'s "Bulk-data bypass rules" for the full pipeline
contract (worker chunk → storage → channel memory → one compact progress
action per chunk).

## Runtime demotion

`StorageTierController` wraps whichever adapter `createStorage()` picked.
The moment any write reports `{ ok: false }`, it demotes one level (full →
partial → none, never back up), carries `playlists`/`favorites`/`recent`
over into the new tier, and calls the `onDemote` callback threaded in from
`createWebPlatform({ onStorageDemote })` — `src/app/bootstrap.ts` wires this
to `handleStorageDemotion()` (`src/state/ui.actions.ts`), which re-publishes
`platform.capabilities`/`storage.tier` into Spektrum state and un-dismisses
the storage notice, without `src/core/` importing the state framework.
Concurrent failing writes share a single in-flight demotion rather than
cascading past the tier that's actually broken.

The demotion is session-scoped only — the next boot re-probes from
scratch, so a transient failure (private-mode toggle, a full disk that gets
freed) doesn't permanently downgrade the app.

## Chunked bulk writes

`writeChunked`/`replaceTableChunked` (`bulk.ts`) stream rows into storage in
`CHUNK_ROWS` (5 000) batches with a macrotask yield between each, so a
90k-row playlist import never blocks the main thread in one long task and
can report progress (`{ written, total }`) shaped directly for
`setValue('import.progress', ...)`. An `AbortSignal` stops the run between
batches — only whole batches ever land, never a partial one.

## Versioning

Long-lived shapes (`settings`, `playlists`, `favorites`, `recent`) are
wrapped `{ v, data }` at the boundary (`versioning.ts`). `getVersioned()`
migrates through a registered hook chain and writes the migrated value back
once; a version newer than the current build (a downgraded app) or a
corrupt envelope resolves `undefined`, never throws. Call
`assertMigrationChainComplete(family, fromV, toV)` once, right after
registering every hook for a key family, so a missing link is a
registry-time error — not something a user hits on a cold read months
later.

## `epgCatalog` (Phase 31) — a second bulk table keyed `[country, id]`

`src/epg/countries.ts`'s XMLTV feeds derive one canonical channel identity
per feed entry (`src/epg/catalog.ts`); `catalog-storage.ts`'s
`replaceCountryCatalog()`/`replaceFileCatalog()` write them here, keyed
`[country, id]` the same way `epgPrograms` keys `[channelId, start]` — no
secondary index needed, the composite primary key already answers "every
row for this country" via a `getRange([country, ''], [country, '￿'])`
bound. `replaceFileCatalog()` scopes the delete-before-write to one feed
file's previous contribution (`sourceFile` field), not the whole country —
a TTL-fresh file that wasn't re-fetched this run keeps its stored rows
instead of being wiped by an incomplete replace. See `src/epg/README.md`
for the full ingestion pipeline this table feeds.

**DB_VERSION bumped 1 → 2** to add this store — the first version bump
since Phase 04. `idb-storage.ts`'s `upgrade()` callback had to change at the
same time: it previously created every `BULK_STORE_NAMES` entry
unconditionally, which was harmless only because the version had never
bumped before (an `upgradeneeded` event that starts from v0 sees no
existing stores to collide with). A same-version-jump `upgrade()` runs
against every store from the *stored* version to `DB_VERSION`, so
`createObjectStore` on an already-existing store now throws — fixed by
guarding each call with `objectStoreNames.contains()`. Any future store
addition must keep that guard; nothing else about the pattern changes.

## Testing

Every tier is exercised for real in tests — `fake-indexeddb` for
`IdbStorage`, jsdom's real `localStorage` for `LocalStorageStorage` — never
mocked at the `StorageAdapter` boundary itself. Downstream phases that just
need *a* working storage layer (not testing storage behavior specifically)
should use `FakePlatform` (`src/core/platform/fake-platform.ts`) instead,
which now wraps this module's real `MemoryStorage` (Feature 04.3.9).
