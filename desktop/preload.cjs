// Exposes the typed `window.electron` bridge (shape pinned by
// `src/core/platform/electron-bridge.types.ts` — `ElectronBridge`; this
// file is plain CommonJS, per Electron's preload requirement, so it can't
// literally import that type, but is reviewed against it byte-for-byte).
// `proxyOrigin` is the one boot-time constant the web app needs to default
// its proxy template in the desktop shell (see
// src/core/platform/electron-platform.ts); `appVersion` is diagnostics-only
// (never for feature gating); the two fullscreen members are the desktop
// fallback for the player's fullscreen button (see main.mjs's
// `publishFullscreenState`). Context isolation stays on; nothing else
// crosses the bridge — no raw `ipcRenderer`, no filesystem, no `require`.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron preload scripts must be CommonJS; require() is the contract here.
const { contextBridge, ipcRenderer } = require('electron');

const PROXY_ORIGIN_PREFIX = '--thundertv-proxy-origin=';
const APP_VERSION_PREFIX = '--thundertv-app-version=';
const IPC_SET_WINDOW_FULLSCREEN = 'thundertv:set-window-fullscreen';
const IPC_WINDOW_FULLSCREEN_STATE = 'thundertv:window-fullscreen';

const proxyOriginArg = process.argv.find((a) => a.startsWith(PROXY_ORIGIN_PREFIX));
const appVersionArg = process.argv.find((a) => a.startsWith(APP_VERSION_PREFIX));

// Mirrored here rather than queried on demand, so the renderer can read it
// synchronously: the player's fullscreen toggle runs inside a click
// handler, where an `await` would spend the click's transient user
// activation before `requestFullscreen()` ever ran.
let windowFullscreen = false;
ipcRenderer.on(IPC_WINDOW_FULLSCREEN_STATE, (_event, value) => {
    windowFullscreen = Boolean(value);
});

if (proxyOriginArg) {
    contextBridge.exposeInMainWorld('electron', {
        proxyOrigin: proxyOriginArg.slice(PROXY_ORIGIN_PREFIX.length),
        appVersion: appVersionArg ? appVersionArg.slice(APP_VERSION_PREFIX.length) : '0.0.0',
        isWindowFullscreen: () => windowFullscreen,
        setWindowFullscreen: (next) => {
            const value = Boolean(next);
            // Optimistic: the main process confirms on its own channel, but
            // a second click landing before that round-trip must not read a
            // stale `false` and re-enter the fullscreen it just left.
            windowFullscreen = value;
            ipcRenderer.send(IPC_SET_WINDOW_FULLSCREEN, value);
        },
    });
}
