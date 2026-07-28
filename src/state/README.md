# Spektrum state architecture (Phase 05)

`src/state/` is the app's single state layer. Every Spektrum key has exactly
one owning module, one persistence class, and (if it's a mutation) exactly
one `defineFn` action that may write it. This file is the map; the
generated `masterplan/reference/state-keys.md` is the per-key detail.

## Module ownership

| Module              | Keys                                                                                                          | Persisted?                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `playlist.ts`        | `playlist.sources`, `playlist.activeSourceId`, `playlist.demoRows`                                                   | `activeSourceId` yes (Feature 08.10.6); `sources` is a live storage projection, `demoRows` is static demo data — neither persists |
| `player.ts`          | `player.active`, `player.zapHistory`, `player.visualizerPreset`, `player.visualizerPaused`                            | Yes — the §6.4 instant-restore pair; `visualizerPreset` also persists (the listener's Radio visualizer choice); `visualizerPaused` does not (always false on a fresh Radio visit) |
| `epg.ts`             | `epg.tick`                                                                                                            | No — a heartbeat timestamp, recomputed every boot |
| `settings.ts`        | `settings.locale`, `settings.proxyTemplate`, `settings.proxyError`, `settings.proxySaved`                            | `locale` yes (Settings → User language switcher, i18n follow-up); `proxyTemplate` yes; the other two are transient save feedback |
| `ui.ts`               | `ui.activeView`, `ui.density`, `ui.settingsOpen`, `ui.storageNoticeDismissed`, `platform.name`, `platform.capabilities`, `storage.tier` | `ui.density`/`ui.storageNoticeDismissed` yes; the rest no |
| `wizard.ts`           | `ui.wizardOpen`, `ui.wizardStep`, `ui.setupComplete`                                                                 | `ui.setupComplete` yes — it is what stops a configured install from being asked again; `wizardOpen`/`wizardStep` no (transient, recomputed/reset every boot and every (re)open, same reasoning as `ui.settingsOpen`) |
| `list.ts`             | `list.visibleRows`, `list.padTop`, `list.padBottom`, `list.selectedId`                                               | No — the Feature 08.1/08.2/08.7 virtual-list window and selection cursor, republished continuously |
| `list-state.ts`       | `ui.listState`, `ui.activeGroup`, `ui.viewMode`                                                                      | `ui.listState` yes (Feature 08.6, LRU-capped at 20 sources); the two live mirrors restore from it on source entry but aren't separately persisted |
| `list-groups.ts`      | `list.groups`, `list.groupsTruncated`                                                                                | No — the groups panel's own row set, capped independently of Phase 06's `MAX_GROUPS` (Feature 08.5.9) |
| `favorites.ts`        | `favorites.ids`                                                                                                       | No — a live projection of the real `favorites` storage table (Feature 08.8.4), exactly like `playlist.sources` |

**The rule:** adding a Spektrum key means adding it to `registry-keys.ts`'s
`KEY_REGISTRY` (owner, `persisted`, optional `maxItems`/`version`,
description) and to the table above, in the same commit. `registry.ts`
itself is just the query surface (`isPersistedKey()`, `persistedKeys()`, …)
and re-exports the table, so every existing `from './registry'` import
still resolves. `KEY_REGISTRY` is
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

- **`list.visibleRows`/`list.padTop`/`list.padBottom`** — published by
  `src/ui/virtual-list.ts`'s `publishWindow()` on every scroll-driven
  republish, via `state/list-publish.ts`'s `publishListWindow()` (the actual
  `setValue`/`set()` call site — `virtual-list.ts` itself never imports
  `spektrum` directly, keeping the "no bare `setValue` outside `src/state/`"
  rule intact without a fourth ESLint carve-out). Anything *derived* from
  the window (row count, empty-list flag) belongs in a `computed()` instead
  (Feature 05.6.4) — none exists yet, nothing has needed one.

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

## `setValue()` merges object values — it does not replace them (Feature 08 finding)

Discovered the hard way while building the Phase 08 favorites/list-state
maps: Spektrum's `setValue(path, value)` **deep-merges** an object-valued
`value` onto whatever is already at `path`, rather than replacing it.
Verified directly against the vendored engine:

```ts
setValue('probe.map', { a: 1, b: 2 });
tick();
setValue('probe.map', { a: 99 });
tick();
// appState.probe.map is { a: 99, b: 2} — "b" survived, even though the
// second write never mentioned it.
```

Array values are unaffected — the engine's own merge function explicitly
excludes arrays, so `list.visibleRows`/`list.groups`/etc. always replace
cleanly. The hazard is specific to `Record<string, T>`-shaped state (a map
you sometimes need to *shrink* a key out of): `favorites.ids` removing a
favorite, or `ui.listState` evicting a source past its LRU cap
(`state/list-state.ts`'s `upsertListState()`). A `delete` on the JS object
before calling `set()` looks correct and compiles fine, but the removed key
silently reappears in live state because `set()` merges the smaller object
back onto the larger one still sitting in `appState`.

**The fix, `state/typed.ts`'s `replace()`:** reset the path to `undefined`
and drain that with one explicit `tick()` before writing the real
(possibly-smaller) value — confirmed this forces a true replace instead of a
merge. `favorites.actions.ts`'s toggle-off path and `list-state-sync.ts`'s
`saveListState()` both use `replace()`, never `set()`, for exactly this
reason; `set()` remains correct and cheaper for every write that only adds
or updates keys (the favorite-on path, `upsertListState()`'s own per-source
patch). Calling `tick()` from application code is otherwise unheard of in
this codebase (production always relies on `run()`'s rAF loop to drain) —
`replace()` is the one sanctioned exception, confined to `state/typed.ts`.

**Any future phase adding a removable-key `Record<string, T>` to Spektrum
state must use `replace()` for the removal path, not `set()`.** Phase 13
(Favorites/Recent) and Phase 15 (Multi-playlist Management) are the most
likely next places this matters.

## Boot order (masterplan §6.4)

`src/app/bootstrap.ts`, in order: `createPlatform()` → `setPlatform()` →
`initState()` (seed every module's defaults) → `rehydrateState()` (overwrite
only the keys with a real, envelope-valid stored value — `KEY_REGISTRY`'s
`persisted` set drives the `getMany` list automatically) → `seedStrings()` →
register actions/selectors → `initRouter()` → `bindDOM()`/`run()`. Only
*after* the restored session is rendering does `void loadActiveSource()`
(the heavy playlist path, stubbed until Phase 06) start — never awaited, so
a slow parse can never delay first paint.

## First-run setup wizard (`wizard.ts`/`wizard.actions.ts`)

`ui.wizardOpen` is set by `wizard.actions.ts`'s `openWizardIfNoSources()`,
called from `bootstrap.ts` right after `loadPlaylistSources()` resolves (not
before — `playlist.sources` is a live storage projection, empty by default
until that load actually completes, so checking any earlier would flash the
wizard open for every returning user for one frame). The "should it open"
decision itself is a pure function, `wizard.ts`'s `shouldOpenWizard()`
(`!setupComplete && sources.length === 0`), unit-tested without touching
Spektrum state.

The `setupComplete` half is the *durable* answer, and the reason a
configured install is never asked twice: `ui.setupComplete` is a persisted
key, so it is rehydrated before the boot check runs. `markSetupComplete()`
(idempotent, writes at most once) sets it when the wizard saves an account,
when the user skips/closes it, and when boot finds a source already
configured — that last one is also how an install predating the flag, or
one set up through the Connect card instead of the wizard, gets it written.
An empty `playlist.sources` on a later boot (a demoted storage tier, a
deleted source, a cleared table) therefore no longer re-triggers the
wizard; `wizard/open` in Settings → Streaming remains the way back in.

The wizard's two steps reuse existing settings rather than inventing
parallel ones: step 1's language/country `<select>`s are wired to the exact
same `settings/setLocale`/`settings/setLiveCountry` `data-fn`s the Settings
panel's own controls use, and step 2's Xtream form calls
`settings.actions.ts`'s `saveXtreamAccount()` directly through a thin
wrapper (`wizard/saveXtreamAccount`) that only adds closing the wizard on a
successful save. `wizard/open` (bound to a "Run setup wizard again" link in
Settings → Streaming) is the sole manual reopen path, so the wizard is never
a one-shot dead end.

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
