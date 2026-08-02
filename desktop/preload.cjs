// Exposes the typed `window.electron` bridge (shape pinned by
// `src/core/platform/electron-bridge.types.ts` — `ElectronBridge`; this
// file is plain CommonJS, per Electron's preload requirement, so it can't
// literally import that type, but is reviewed against it byte-for-byte).
// `proxyOrigin` is the one boot-time constant the web app needs to default
// its proxy template in the desktop shell (see
// src/core/platform/electron-platform.ts); `appVersion` is diagnostics-only
// (never for feature gating); the two fullscreen members are the desktop
// fallback for the player's fullscreen button (see main.mjs's
// `publishFullscreenState`); `getDefaultConfig` surfaces `desktop/.env`'s
// dev-only first-run defaults — Xtream account, locale, Live-filter country
// (see main.mjs's `loadDefaultConfig`); `downloads` saves a movie to disk
// from the main process, which is the one member that is more than a value
// read — it exists so a multi-gigabyte file never has to pass through the
// renderer at all (see main.mjs's `registerDownloadHandlers`);
// `transcode` is the origin + token of the localhost server that re-encodes
// a film's undecodable audio on the fly (see transcode.mjs), `null` where
// that server did not start. Context
// isolation stays on; nothing else crosses the bridge — no raw
// `ipcRenderer`, no filesystem, no `require`.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron preload scripts must be CommonJS; require() is the contract here.
const { contextBridge, ipcRenderer } = require('electron');

const PROXY_ORIGIN_PREFIX = '--thundertv-proxy-origin=';
const APP_VERSION_PREFIX = '--thundertv-app-version=';
const TRANSCODE_ORIGIN_PREFIX = '--thundertv-transcode-origin=';
const TRANSCODE_TOKEN_PREFIX = '--thundertv-transcode-token=';
const IPC_SET_WINDOW_FULLSCREEN = 'thundertv:set-window-fullscreen';
const IPC_WINDOW_FULLSCREEN_STATE = 'thundertv:window-fullscreen';
const IPC_GET_DEFAULT_CONFIG = 'thundertv:get-default-config';
const IPC_DOWNLOAD_PREPARE = 'thundertv:download-prepare';
const IPC_DOWNLOAD_START = 'thundertv:download-start';
const IPC_DOWNLOAD_CANCEL = 'thundertv:download-cancel';
const IPC_DOWNLOAD_EVENT = 'thundertv:download-event';

const proxyOriginArg = process.argv.find((a) => a.startsWith(PROXY_ORIGIN_PREFIX));
const appVersionArg = process.argv.find((a) => a.startsWith(APP_VERSION_PREFIX));
const transcodeOriginArg = process.argv.find((a) => a.startsWith(TRANSCODE_ORIGIN_PREFIX));
const transcodeTokenArg = process.argv.find((a) => a.startsWith(TRANSCODE_TOKEN_PREFIX));

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
        appVersion: appVersionArg ? appVersionArg.slice(APP_VERSION_PREFIX.length) : '1.0.0',
        isWindowFullscreen: () => windowFullscreen,
        setWindowFullscreen: (next) => {
            const value = Boolean(next);
            // Optimistic: the main process confirms on its own channel, but
            // a second click landing before that round-trip must not read a
            // stale `false` and re-enter the fullscreen it just left.
            windowFullscreen = value;
            ipcRenderer.send(IPC_SET_WINDOW_FULLSCREEN, value);
        },
        getDefaultConfig: () => ipcRenderer.invoke(IPC_GET_DEFAULT_CONFIG),
        // Two constants, not a method: the renderer builds its own `/stream`
        // URLs and hands them to `fetch`/MediaSource, so nothing about a
        // multi-gigabyte film has to travel over IPC. `null` (no argv from
        // the main process) means this build cannot transcode at all.
        transcode:
            transcodeOriginArg && transcodeTokenArg
                ? {
                      origin: transcodeOriginArg.slice(TRANSCODE_ORIGIN_PREFIX.length),
                      token: transcodeTokenArg.slice(TRANSCODE_TOKEN_PREFIX.length),
                  }
                : null,
        downloads: {
            prepare: (filename) => ipcRenderer.invoke(IPC_DOWNLOAD_PREPARE, String(filename)),
            start: (id, url, targetToken) => {
                ipcRenderer.send(IPC_DOWNLOAD_START, String(id), String(url), String(targetToken));
            },
            cancel: (id) => {
                ipcRenderer.send(IPC_DOWNLOAD_CANCEL, String(id));
            },
            // The listener is wrapped rather than handed to `ipcRenderer`
            // directly: the renderer must never see the `IpcRendererEvent`
            // (it carries `sender`, a live handle back into the IPC surface
            // this bridge exists to keep out of the page).
            onEvent: (listener) => {
                const handler = (_event, payload) => {
                    listener(payload);
                };
                ipcRenderer.on(IPC_DOWNLOAD_EVENT, handler);
                return () => {
                    ipcRenderer.off(IPC_DOWNLOAD_EVENT, handler);
                };
            },
        },
    });
}
