# Platform adapter layer

One interface (`PlatformAdapter`) decouples the entire app from its host —
mirroring thunder-tv's `DataFactory()`/`DataService` pattern. `createPlatform()`
detects the environment once at boot (`window.electron` truthy → Electron,
otherwise web), and everything downstream reaches it only through
`getPlatform()` — never by constructing or importing a concrete platform
implementation directly.

```
createPlatform() → WebPlatform | ElectronPlatform (electron-platform.ts)
                        │
                        ▼
                  setPlatform(platform)   // main.ts, once, before render
                        │
                        ▼
        getPlatform().http / .files / .storage / .capabilities
```

Zero UI changes — every consumer already goes through `capabilities`, never
`window.electron` directly (enforced by an ESLint fence outside this
folder).

## The desktop adapter, and the decision behind it

`electron-platform.ts` is the real, non-throwing `ElectronPlatformAdapter`
(there used to be a `create-platform.ts` throw here — "not yet implemented,
arrives in Phase 28" — but nothing in `desktop/` ever set `window.electron`,
only `window.thunderDesktop`, so the throw was unreachable and the desktop
shell silently ran the *web* adapter the whole time; that bug is fixed).

The masterplan's full Phase 28 scope (Feature 28.4) was a main-process
`net.request` HTTP passthrough behind IPC — `window.electron.http.request()`
with chunked streaming, cancel-by-id, conditional-GET passthrough, and a
full error-taxonomy remap. Instead, `createElectronPlatform()` formalizes
the simpler thing `desktop/main.mjs` already had running: the proven
`WebHttpAdapter`/`classifiedFetch` pipeline, unmodified, defaulted to route
through the proxy `desktop/main.mjs` embeds on `127.0.0.1` (every provider
request leaves from the desktop machine's own IP — the whole point for
panels that block datacenter IPs). `window.electron` is the typed bridge
(`electron-bridge.types.ts`) preload exposes with `{ proxyOrigin,
appVersion }`; `capabilities.corsUnrestricted` reports `true` on desktop
because the proxy does in fact make every request CORS-free from the
renderer's point of view, even though the mechanism differs from a literal
main-process fetch.

Why this over the full IPC HTTP adapter: smaller, safer diff against
everything already built on the current behavior — chunked bodies,
conditional-GET, and the classified-fetch error taxonomy all already work
end-to-end through the existing web stack; an IPC passthrough would have to
re-implement or bridge all of that from scratch for zero renderer-visible
behavior change. Native file dialogs, main-process error logging, and
window-state persistence remain main-process-only concerns (`desktop/`)
and are out of this adapter's scope.

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

## `windowFullscreen` — the one optional adapter member

`PlatformAdapter.windowFullscreen` is present only where the host owns a
window of its own to fullscreen (Electron), and absent on web, where the
page is a guest in somebody else's browser window. It is the "new adapter
method added when a real consumer needs it" case `platform-adapter.ts`'s
header describes: the player's fullscreen toggle
(`src/state/player.actions.ts`) falls back to it when page-level fullscreen
doesn't take. Both members are synchronous — the toggle runs inside a click
handler, and an `await` there would spend the click's transient user
activation before `requestFullscreen()` ever ran — which is why
`desktop/preload.cjs` mirrors the main process's fullscreen state into a
local cache rather than answering over IPC on demand.

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
