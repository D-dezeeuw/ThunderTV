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

## `downloads` — saving a movie or episode to disk

`PlatformAdapter.downloads` (`download-adapter.ts`) is the second member
added under the "new adapter method when a real consumer needs it" rule,
and unlike `windowFullscreen` it is non-optional: both hosts can save a
file, they just differ in how well. `capabilities.downloads` reports which:

| Value       | Host                                        | Progress + cancel? |
| ----------- | ------------------------------------------- | ------------------ |
| `managed`   | Electron; web with File System Access       | Yes — real         |
| `handoff`   | web without it (Firefox, Safari)            | No — the browser owns it |
| `none`      | nothing ships this; the safe default        | n/a                |

Movies and TV episodes, never live channels: both VOD shapes
(`/movie/{user}/{pass}/{id}.{ext}`, `/series/{user}/{pass}/{id}.{ext}`) are
static files with a real `Content-Length` and a real end, while a live
channel is an endless transport stream with neither — there is no "done" to
download to. The proxy already forwards `Range` and passes
`content-range`/`accept-ranges` back (`scripts/proxy-server.mjs`), so ranged
transfers needed nothing new.

**Why `prepare()` and `start()` are two calls.** The web save picker
(`showSaveFilePicker`) requires transient user activation, so it must run
inside the click that asked for the download — but a *queue* starts most
transfers long after that click. So the destination is chosen up front and
the transfer happens whenever the runner reaches it. Callers must therefore
call `prepare()` as the first statement of a click handler, before any
`await`; `src/state/downloads.actions.ts` does, and anything added later
must too.

`web-downloads.ts` streams `response.body` into a
`FileSystemWritableFileStream` — deliberately *not* `fetch` → `Blob` →
`createObjectURL`, which buffers the whole file in memory and is exactly the
failure mode this exists to avoid. `electron-downloads.ts` is a thin client
over `desktop/main.mjs`, which streams to disk in the main process, so a
feature-length film never passes through the renderer at all.

The queue itself, its serial-by-design runner, and the UI live in
`src/state/downloads.ts`/`downloads.actions.ts` — see `src/state/README.md`.

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

`corsUnrestricted` is no longer web-false/desktop-true. It is true wherever a
proxy actually covers the cross-origin paths — the embedded one on desktop, or
a user-configured template on the web (`createWebCapabilities`'s second
argument, fed live from `settings.proxyTemplate`). Same honest-capability
argument as the desktop entry above; see `src/core/http/README.md` for which
paths the proxy covers, and which failure a proxy can't fix.

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

## `audioTranscode` — the second optional member

`PlatformAdapter.audioTranscode` (`transcode-adapter.ts`) is present only on
the Electron adapter, and only when its main process actually started a
transcode server (`window.electron.transcode` non-null). It exists because
Chromium has no AC-3/E-AC-3/DTS decoder and a desktop host does: `open()`
returns the `Response` of a localhost stream carrying the same film with its
audio re-encoded, which `src/player/transcode-engine.ts` pumps into
MediaSource. The fetch lives here rather than in `src/player/` for the
ordinary reason (Feature 03.9), and deliberately not through
`WebHttpAdapter`: that layer exists to classify and *complete* a request,
and this one is an endless body read for as long as the film lasts.

No matching `capabilities` flag, on purpose. The member's presence is the
capability — a boolean beside it would be a second copy of "is the member
there" with nothing keeping the two honest, which is exactly the drift
`durableStorage`'s live getter avoids. Same reasoning as
`windowFullscreen`; a UX-level *policy* question (should the CORS warning
show?) is what `capabilities` is for.

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
