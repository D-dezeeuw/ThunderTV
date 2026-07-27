// Exposes the embedded proxy's origin to the renderer as
// `window.thunderDesktop.proxyOrigin` — the one boot-time constant the web
// app needs to default its proxy template in the desktop shell (see
// src/core/platform/desktop-proxy.ts). Context isolation stays on;
// nothing else crosses the bridge.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron preload scripts must be CommonJS; require() is the contract here.
const { contextBridge } = require('electron');

const ARG_PREFIX = '--thundertv-proxy-origin=';
const arg = process.argv.find((a) => a.startsWith(ARG_PREFIX));

if (arg) {
    contextBridge.exposeInMainWorld('thunderDesktop', {
        proxyOrigin: arg.slice(ARG_PREFIX.length),
    });
}
