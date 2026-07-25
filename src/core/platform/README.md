# Platform adapter layer

One interface (`PlatformAdapter`) decouples the entire app from its host —
mirroring thunder-tv's `DataFactory()`/`DataService` pattern. `createPlatform()`
detects the environment once at boot (`window.electron` truthy → Electron,
otherwise web), and everything downstream reaches it only through
`getPlatform()` — never by constructing or importing a concrete platform
implementation directly.

```
createPlatform() → WebPlatform (today) | ElectronPlatform (Phase 28)
                        │
                        ▼
                  setPlatform(platform)   // main.ts, once, before render
                        │
                        ▼
        getPlatform().http / .files / .storage / .capabilities
```

When Phase 28 lands, the swap is: one new `createElectronPlatform()` plus a
preload bridge. Zero UI changes — every consumer already goes through
`capabilities`, never `window.electron` directly (enforced by an ESLint fence
outside this folder).

## Capabilities, not environment checks

`capabilities` is declared data (`corsUnrestricted`, `externalPlayers`,
`durableStorage`). UX decisions read from it:

```ts
if (!getPlatform().capabilities.corsUnrestricted) {
    // show the CORS explanation + alternatives (see src/core/http/README.md)
}
```

New capabilities are added as new fields with safe defaults, never by
widening an existing one's meaning.

## Testing against `FakePlatform`

`fake-platform.ts` is test-only (never imported outside `*.spec.ts` —
`scripts/check-dist.mjs` fails the build if a symbol from it reaches
`dist/`). Every downstream phase should test against it instead of live
network, real files, or real storage:

```ts
import { withFakePlatform } from '../core/platform/fake-platform';

it('shows the CORS explanation on a blocked import', async () => {
    await withFakePlatform({}, async ({ http }) => {
        http.onGet(url).reply({ kind: 'cors-or-network', crossOrigin: true, offlineHint: false });
        // exercise the real code path that calls getPlatform().http.get(url) …
    });
});
```

`withFakePlatform(capabilityOverrides, fn)` installs the fake for the
duration of `fn` and restores the accessor afterward, so specs never leak
platform state into unrelated tests. `FakeHttpAdapter` needs every URL
scripted via `onGet(url).reply(...)` before a `get()` call — an unscripted
URL throws immediately, so a spec can never accidentally fall through to a
real network call.

## Storage

`storage` is the real, boot-probed tiered `StorageAdapter` (IndexedDB →
localStorage → memory) from `src/core/storage/` (Phase 04) — see that
module's own README for the tier-selection, demotion, chunking, and
versioning details. `capabilities.durableStorage` is a live getter derived
from `storage.tier`, never a separately cached value, so it can never drift
from the real tier after a runtime demotion.
