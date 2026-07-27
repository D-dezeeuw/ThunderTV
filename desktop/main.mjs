/**
 * ThunderTV desktop shell (masterplan Phase 28's MVP slice, pulled forward
 * the same way the Xtream MVP was): an Electron window around the built
 * web app, with the proven proxy pipeline embedded on 127.0.0.1.
 *
 * Why the embedded proxy instead of disabling webSecurity or building the
 * full IPC HttpAdapter now: the renderer keeps every browser security
 * default, and the entire already-validated web stack — Xtream import,
 * stream-shape detection, manifest rewriting, logo proxying, auto-refresh —
 * works unchanged; only the proxy template is defaulted for it (see
 * `src/core/platform/desktop-proxy.ts`). Every provider request leaves
 * from this machine's own IP, which is the whole point for panels that
 * block datacenter IPs. The real Electron platform adapter (IPC-backed
 * HttpAdapter, SQLite, capabilities) remains Phase 28's full scope.
 *
 * Run from the repo:  cd desktop && npm install && npm start
 * (`npm start` builds the web app, swaps the import map to the vendored
 * Spektrum copy via scripts/package-target.mjs, then launches Electron.)
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProxyServer } from '../scripts/proxy-server.mjs';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

async function start() {
    // Loopback-only bind: never reachable from the network, so no
    // ALLOWED_HOSTS needed — this is not an open proxy.
    const { origin } = await createProxyServer({ host: '127.0.0.1', port: 0 });

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: '#0b0d10',
        webPreferences: {
            preload: path.join(desktopDir, 'preload.cjs'),
            // The proxy origin travels to the preload via argv — no IPC
            // round-trip needed for a boot-time constant.
            additionalArguments: [`--thundertv-proxy-origin=${origin}`],
        },
    });

    await win.loadFile(path.join(desktopDir, '..', 'dist', 'index.html'));
}

app.whenReady().then(
    () => void start(),
    (err) => {
        console.error(err);
        app.quit();
    },
);

app.on('window-all-closed', () => {
    app.quit();
});
