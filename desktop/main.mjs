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
 * `src/core/platform/electron-platform.ts`). Every provider request leaves
 * from this machine's own IP, which is the whole point for panels that
 * block datacenter IPs. See that file's header comment (and
 * `src/core/platform/README.md`) for the full platform-adapter decision —
 * the main-process `net.request` IPC passthrough from the original Phase
 * 28 plan is deliberately not built; the smaller diff on top of this
 * already-working pipeline is.
 *
 * Security posture (masterplan Feature 28.8, all explicit, never left to
 * version defaults): `contextIsolation`/`sandbox` on, `nodeIntegration`
 * off, no `webviewTag`, a single-instance lock, a denied window-open
 * handler, and a same-origin navigation lock. See `electron-builder.yml`
 * and the CI workflows for the packaging half of "shippable."
 *
 * Run from the repo:  cd desktop && npm install && npm start
 * (`npm start` builds the web app, swaps the import map to the vendored
 * Spektrum copy via scripts/package-target.mjs, then launches Electron.)
 */
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProxyServer } from '../scripts/proxy-server.mjs';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
// Dev-only (masterplan Feature 29.3.6): resolves for an unpackaged
// `npm start` run, where `desktop/` and `build/` are repo-root siblings.
// A packaged build's own OS-level icon (electron-builder.yml's win/mac/
// linux `icon:` config) is what actually shows in taskbars/docks once
// installed — `build/` isn't bundled into the asar, so this path silently
// resolves to nothing there and Electron falls back to its default icon,
// which is fine since the packaged case is already covered.
const appIconPath = path.join(desktopDir, '..', 'build', 'icons', '256.png');
const APP_BACKGROUND_COLOR = '#0b0d10';

// Single-instance lock (Feature 28.1.6): a second launch attempt quits
// immediately and focuses the already-running window instead of spawning a
// duplicate proxy server and BrowserWindow.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    let mainWindow = null;

    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    async function start() {
        const splash = createSplashWindow();

        // Loopback-only bind: never reachable from the network, so no
        // ALLOWED_HOSTS needed — this is not an open proxy.
        const { origin } = await createProxyServer({ host: '127.0.0.1', port: 0 });

        mainWindow = new BrowserWindow({
            width: 1280,
            height: 800,
            minWidth: 720,
            minHeight: 480,
            backgroundColor: APP_BACKGROUND_COLOR,
            show: false,
            icon: appIconPath,
            webPreferences: {
                preload: path.join(desktopDir, 'preload.cjs'),
                // Explicit, never implicit (masterplan Feature 28.8.1) —
                // written out even though current Electron defaults to the
                // same values, so a future Electron major can't silently
                // change this app's security posture.
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                webviewTag: false,
                // The proxy origin and app version travel to the preload
                // via argv — no IPC round-trip needed for boot-time
                // constants.
                additionalArguments: [
                    `--thundertv-proxy-origin=${origin}`,
                    `--thundertv-app-version=${app.getVersion()}`,
                ],
            },
        });

        applySecurityPolicy(mainWindow);

        mainWindow.once('ready-to-show', () => {
            mainWindow?.show();
            if (!splash.isDestroyed()) splash.destroy();
        });

        await mainWindow.loadFile(path.join(desktopDir, '..', 'dist', 'index.html'));
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
}

/**
 * Frameless, small, centered — shown the instant the app is ready, closed
 * once the real window fires `ready-to-show` (Feature 28's splash
 * requirement). No animation, deliberately: this exists only to avoid a
 * blank window during the proxy-server boot + `loadFile` window.
 */
function createSplashWindow() {
    const splash = new BrowserWindow({
        width: 420,
        height: 280,
        frame: false,
        resizable: false,
        movable: false,
        alwaysOnTop: true,
        backgroundColor: APP_BACKGROUND_COLOR,
        skipTaskbar: true,
        show: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    void splash.loadFile(path.join(desktopDir, 'splash.html'));
    return splash;
}

/**
 * Feature 28.8.2/28.8.3: popups are always denied (this app has no
 * legitimate use for a new BrowserWindow); an `http(s):` target is instead
 * handed to the OS browser via `shell.openExternal` so a future external
 * link (About/release-notes) doesn't silently do nothing. Navigation away
 * from the packaged app's own `file://` entry is cancelled outright — hash
 * changes for in-app routing are untouched since they don't trigger
 * `will-navigate`.
 */
function applySecurityPolicy(win) {
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedExternalUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        if (isSameOriginNavigation(win, url)) return;
        event.preventDefault();
        if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    });

    // Feature 28.8.6: deny every permission request by default — this app
    // needs none of notifications/geolocation/media-device access from the
    // packaged renderer.
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
        callback(false);
    });
}

function isAllowedExternalUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function isSameOriginNavigation(win, url) {
    try {
        return new URL(url).origin === new URL(win.webContents.getURL()).origin;
    } catch {
        return false;
    }
}
