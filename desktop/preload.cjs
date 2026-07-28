// Exposes the typed `window.electron` bridge (shape pinned by
// `src/core/platform/electron-bridge.types.ts` — `ElectronBridge`; this
// file is plain CommonJS, per Electron's preload requirement, so it can't
// literally import that type, but is reviewed against it byte-for-byte).
// `proxyOrigin` is the one boot-time constant the web app needs to default
// its proxy template in the desktop shell (see
// src/core/platform/electron-platform.ts); `appVersion` is diagnostics-only
// (never for feature gating). Context isolation stays on; nothing else
// crosses the bridge — no raw `ipcRenderer`, no filesystem, no `require`.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron preload scripts must be CommonJS; require() is the contract here.
const { contextBridge } = require('electron');

const PROXY_ORIGIN_PREFIX = '--thundertv-proxy-origin=';
const APP_VERSION_PREFIX = '--thundertv-app-version=';

const proxyOriginArg = process.argv.find((a) => a.startsWith(PROXY_ORIGIN_PREFIX));
const appVersionArg = process.argv.find((a) => a.startsWith(APP_VERSION_PREFIX));

if (proxyOriginArg) {
    contextBridge.exposeInMainWorld('electron', {
        proxyOrigin: proxyOriginArg.slice(PROXY_ORIGIN_PREFIX.length),
        appVersion: appVersionArg ? appVersionArg.slice(APP_VERSION_PREFIX.length) : '0.0.0',
    });
}
