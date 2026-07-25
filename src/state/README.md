# Spektrum state architecture (Phase 05)

`src/state/` is the app's single state layer. Every Spektrum key has exactly
one owning module, one persistence class, and (if it's a mutation) exactly
one `defineFn` action that may write it. This file is the map; the
generated `masterplan/reference/state-keys.md` is the per-key detail.

## Module ownership

| Module              | Keys                                                                                                          | Persisted?                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `playlist.ts`        | `playlist.sourceCount`, `playlist.demoRows`, `playlist.lastPickedLabel`                                              | No — all three are Phase 01-03 stub/demo state, superseded once Phase 07 lands `playlist.sources`/`activeSourceId`/`importProgress` |
| `player.ts`          | `player.active`, `player.zapHistory`                                                                                 | Yes — the §6.4 instant-restore pair |
| `epg.ts`             | `epg.tick`                                                                                                            | No — a heartbeat timestamp, recomputed every boot |
| `settings.ts`        | `settings.proxyTemplate`                                                                                             | Yes |
| `ui.ts`               | `ui.activeView`, `ui.density`, `ui.settingsOpen`, `ui.storageNoticeDismissed`, `platform.name`, `platform.capabilities`, `storage.tier` | `ui.density`/`ui.storageNoticeDismissed` yes; the rest no |

**The rule:** adding a Spektrum key means adding it to `registry.ts`'s
`KEY_REGISTRY` (owner, `persisted`, optional `maxItems`/`version`,
description) and to the table above, in the same commit. `KEY_REGISTRY` is
the single source of truth the persistence bridge (05.3), boot rehydration
(05.4), the bulk-data guard (05.8), and the generated reference doc (05.9)
all read — nothing downstream should ever need a second list.

## Layering rule

- `src/state/**` may import from `spektrum`, `src/core/**`, and
  `src/app/router.ts`/`src/app/strings.ts` (types/constants only) — never
  the other direction. Nothing in `src/app/`, `src/ui/`, or elsewhere reads
  or writes Spektrum state except through a `state/*` export.
- **No bare `setValue` outside `src/state/`.** Enforced by an ESLint
  `no-restricted-syntax` rule (`eslint.config.js`, Feature 05.2.5) banning
  any `setValue(...)` call site outside `src/state/**`, with two carve-outs:
  `src/app/router.ts` (the sole sanctioned publisher of `ui.activeView`,
  see below) and `*.spec.ts` files anywhere (test arrange-phase setup).
- `computed()` selectors are read-only by construction — `src/state/*.selectors.ts`
  files never call `setValue`/`set()`.

## Sanctioned non-action publishers

Two keys are written directly with `setValue`, not through a `defineFn`
action, because nothing user-triggered causes the write:

- **`ui.activeView`** — written only by `src/app/router.ts`'s `applyRoute()`,
  driven by `hashchange`/the initial URL. `initUiState()` deliberately does
  not seed this key; the router is its only writer, always.
- **`epg.tick`** — written by `src/state/epg.ts`'s `startEpgTick()`, driven
  by a 30s `setInterval` (masterplan §5.5's single global heartbeat, instead
  of a timer per visible row).

A third, not yet built: Phase 08's virtual-list windowing controller will
publish `list.visibleRows`/`list.padTop`/`list.padBottom` the same way —
anything *derived* from that window (row count, empty-list flag) belongs in
a `computed()` here instead (Feature 05.6.4).

## Naming rules

- **Keys:** `module.camelCase` (`player.active`, `ui.storageNoticeDismissed`).
  Always a typed constant exported from the owning module — no string
  literals at call sites.
- **Actions:** `module/verbPhrase` (`player/setActiveChannel`,
  `ui/toggleSettings`, `playlist/pickM3uFile`) — the `defineFn` name doubles
  as the `data-fn` markup attribute.
- **Renaming a persisted key** requires a Feature 04.9 migration hook
  (`src/core/storage/versioning.ts`) — a stored blob under the old key would
  otherwise silently stop being read. Bump `KeyMeta.version` in the same
  commit as the rename.

## Existing-key decisions (Feature 05.1.3)

Recorded here once instead of re-litigated at every call site:

- **`storage.tier`, `platform.name`, `platform.capabilities`** stay under
  their original, unnamespaced key strings and are documented as
  `ui`-owned diagnostics in `KEY_REGISTRY`, rather than renamed to
  `ui.storageTier`/`ui.platform*`. All three are recomputed fresh every
  boot (never persisted) — renaming them would only touch already-tested
  Phase 03/04 bindings and specs for no behavioral gain.
- **Density stays under `ui.density`**, not moved into `settings.ts`, for
  continuity with Phase 02 — `settings.ts`'s own module comment notes this.
- **`strings`** (the static `src/app/strings.ts` copy mirror) is outside
  `KEY_REGISTRY` entirely (`NON_REGISTRY_KEYS`) — it's reference data, never
  a mutation or persistence candidate, seeded once by `seedStrings()`.
- **`activeSource`, `favoriteIds`, `ui.viewState`** (Features 05.6.2,
  05.6.3, 05.5.4) are deliberately **not implemented in Phase 05** — none of
  `playlist.sources`/`activeSourceId`, a favorites snapshot, or a real
  per-view search/group UI exists yet. Implementing these selectors now
  would mean inventing Phase 07/13's data shapes speculatively. Phase 07/13
  add them alongside the real state they join.
- **The typed-action-helper split (05.2.6 vs. 05.9.2)** is one mechanism,
  not two: `src/state/typed.ts`'s `set()`/`get()` is both the typed wrapper
  and the dev-mode bulk-data choke point. A separate `action<T>(name, fn)`
  wrapper around `defineFn` was not built — `defineFn`'s own signature
  already types `(el, state, delta, value)`, and the real payload typing
  problem is solved by exporting a typed function alongside the thin
  `defineFn` wrapper (see `player.actions.ts`'s `setActiveChannel()`).

## The persistence bridge, in one paragraph

Actions call `persist(key)` after a `setValue`/`set()` write. `persist()`
throws in dev if `key` isn't marked `persisted` in the registry — a typo
fails at the call site, not silently. A 500ms debounce (`src/state/persist.ts`)
coalesces every key dirtied in that window into one `storage.setMany()`,
wrapped per key in the Feature 04.9 version envelope (`{ v, data }`). A
failed flush re-marks its batch dirty and retries on the next window —
never a hot loop, never thrown into an action. `registerPersistOnHide()`
forces a best-effort flush on `visibilitychange`/`pagehide` so closing the
tab right after a mutation still persists it.

## Boot order (masterplan §6.4)

`src/app/bootstrap.ts`, in order: `createPlatform()` → `setPlatform()` →
`initState()` (seed every module's defaults) → `rehydrateState()` (overwrite
only the keys with a real, envelope-valid stored value — `KEY_REGISTRY`'s
`persisted` set drives the `getMany` list automatically) → `seedStrings()` →
register actions/selectors → `initRouter()` → `bindDOM()`/`run()`. Only
*after* the restored session is rendering does `void loadActiveSource()`
(the heavy playlist path, stubbed until Phase 06) start — never awaited, so
a slow parse can never delay first paint.

## Bulk-data bypass rules (Feature 05.8)

Anything that can exceed ~1000 items (`MAX_RECORDED_COLLECTION`, in
`bulk-policy.ts`) never becomes a Spektrum value: it lives in module memory
(`src/m3u/channel-memory.ts`'s `allRows`, once Phase 06 lands) and in
storage's bulk tables (`src/core/storage/README.md`'s "two surfaces"),
publishing only compact, capped derived slices into state (zap history ≤ 20,
a visible window ≤ ~40 rows, etc. — each ceiling recorded as the key's own
`maxItems` in `KEY_REGISTRY`). The documented pipeline for a chunked import:

```
worker parses a chunk
  → writeChunked() persists the chunk to storage's bulk tables
  → the chunk is appended to channel-memory.ts's allRows
  → exactly one playlist/importProgress action fires per chunk
     (a compact { written, total } counter — never row data)
```

`src/state/typed.ts`'s `set()` calls `assertCompact(key, value)` in dev on
every write — an array payload over the key's registered `maxItems` (or the
1000 global default for an unregistered key) logs one warning and does
nothing else; it never throws, so a bug here is loud in development and free
in production. See `src/core/storage/README.md` for the storage-tier half of
this contract.

## Time-travel policy (Feature 05.7)

`history-policy.ts` caps Spektrum's recorded history at 200 entries in dev
and trims it to 0 after every mutation in prod (behaviorally disabled — the
closest supported mechanism to the pinned `spektrum@1.1.0` singleton, which
has no runtime `historyLimit` setter; see the file's own comment for why a
full switch to `createSpektrum()` wasn't worth it for this one policy).
`devtools.ts` exposes `window.__tl.replay(n)`/`__tl.dumpState()`, imported
only behind `if (import.meta.env.DEV)` in `bootstrap.ts` so it tree-shakes
out of `dist/`.

**Reproducing a state bug in dev:** open the console, trigger the buggy
sequence, then call `__tl.dumpState()` to inspect the full manifest
(`state`, `cursor`, `historyLength`, registered `fns`, …) or `__tl.replay(n)`
to scrub back to history index `n` and step forward again. This only works
in dev — a prod build has nothing to replay by design, so a bug report from
production needs to be reproduced locally first.

## Testing

- Unit specs sit beside their module (`player.actions.spec.ts`,
  `persist.spec.ts`, …), using `FakePlatform`/`withFakePlatform` for
  anything touching storage, exactly like the platform/storage layers.
- `src/shared/testing/bind-dom.ts` is the shared bindDOM harness (Feature
  05.10): `mountTemplate(html)` runs a fresh seed-then-bind mount;
  `mountAfterBoot(html)` additionally rehydrates first, for specs proving
  the restored-session-renders-before-heavy-load promise. Both return
  `query`/`queryAll`/`dispatch`/`cleanup`. `dispatch(fnName, value)` clicks
  a `[data-fn="fnName"]` element already present in the mounted markup —
  it does not synthesize one, and `value` can only carry what Spektrum's
  own `data-value` coercion supports (boolean/number/string, never a
  structured object); specs needing a full payload (e.g. a channel
  snapshot) call the exported action function directly instead, per
  Feature 05.2.7's "actions are plain, synchronous, directly callable
  functions."
