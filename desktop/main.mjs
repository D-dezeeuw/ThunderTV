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
import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProxyServer } from '../scripts/proxy-server.mjs';
import { registerDownloadHandlers } from './downloads.mjs';
import { createTranscodeServer } from './transcode.mjs';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const APP_BACKGROUND_COLOR = '#0b0d10';

// IPC channel names, spelled once and shared with `preload.cjs` by review
// (a sandboxed CommonJS preload can't import from this ESM module).
const IPC_SET_WINDOW_FULLSCREEN = 'thundertv:set-window-fullscreen';
const IPC_WINDOW_FULLSCREEN_STATE = 'thundertv:window-fullscreen';
const IPC_GET_DEFAULT_CONFIG = 'thundertv:get-default-config';

// The runtime window/dock icon. Both candidates are tried because the file
// lives in a different place depending on how the app was started:
//   - packaged: electron-builder copies `build/icons/` into the app as
//     `icons/` (see `electron-builder.yml`'s `files` mapping — it used to
//     copy nothing, which is exactly why packaged builds showed Electron's
//     default icon);
//   - `npm start` from the repo: `desktop/` and `build/` are siblings.
const ICON_CANDIDATES = [
    path.join(desktopDir, 'icons', '512.png'),
    path.join(desktopDir, '..', 'build', 'icons', '512.png'),
];

// The built web app, which moves for exactly the same reason the icon does
// — and for a while pointed only at the unpackaged location, so every
// packaged build opened a window onto `ERR_FILE_NOT_FOUND` while
// `npm start` looked perfectly healthy:
//   - packaged: `electron-builder.yml` maps `../dist` to `dist` *inside*
//     `app.asar`, so it sits beside `main.mjs`;
//   - `npm start` from the repo: `desktop/` and `dist/` are siblings.
// `fs` (not a bare path check) again, so the packaged branch can see into
// the asar archive.
const INDEX_HTML_CANDIDATES = [
    path.join(desktopDir, 'dist', 'index.html'),
    path.join(desktopDir, '..', 'dist', 'index.html'),
];

/**
 * Resolves the built `index.html`, or throws naming both candidates.
 * Throwing beats letting `loadFile` reject: a packaging mistake here is
 * fatal and should say so, not surface as a blank window plus an
 * unhandled rejection in a log nobody reads.
 */
function resolveIndexHtml() {
    for (const candidate of INDEX_HTML_CANDIDATES) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(
        `ThunderTV: no built web app found. Run \`npm run build\` at the repo root. Looked in:\n  ${INDEX_HTML_CANDIDATES.join('\n  ')}`,
    );
}

/**
 * Loads the app icon as a `NativeImage`, or `null` when none of the
 * candidates exist. Read through `fs` rather than
 * `nativeImage.createFromPath()`: inside a packaged build the icon lives in
 * `app.asar`, and Node's `fs` is the layer Electron patches to see into an
 * asar archive.
 */
function loadAppIcon() {
    for (const candidate of ICON_CANDIDATES) {
        try {
            const image = nativeImage.createFromBuffer(fs.readFileSync(candidate));
            if (!image.isEmpty()) return image;
        } catch {
            // Not this one — try the next candidate.
        }
    }
    return null;
}

const appIcon = loadAppIcon();

/**
 * Local dev convenience only (never packaged — `.env` is outside
 * `electron-builder.yml`'s files allowlist, so this always returns all-null
 * fields in a distributed build unless someone's own checkout happens to
 * have the file). Lets a developer stop re-answering the first-run wizard
 * on every fresh profile/storage reset: `bootstrap.ts` treats a non-null
 * field here as a pre-filled wizard answer — `locale`/`liveCountry` seed
 * Settings → User/Live filter, `xtream` (only when all three of its own
 * fields are present) auto-imports the active source — applied only while
 * the wizard would otherwise open, never as a standing override afterward.
 */
function loadDefaultConfig() {
    let raw;
    try {
        raw = fs.readFileSync(path.join(desktopDir, '.env'), 'utf8');
    } catch {
        return { xtream: null, locale: null, liveCountry: null };
    }
    const env = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
    const url = env.THUNDERTV_XTREAM_URL;
    const username = env.THUNDERTV_XTREAM_USERNAME;
    const password = env.THUNDERTV_XTREAM_PASSWORD;
    return {
        xtream: url && username && password ? { url, username, password } : null,
        locale: env.THUNDERTV_LOCALE || null,
        liveCountry: env.THUNDERTV_LIVE_COUNTRY || null,
    };
}

const defaultConfig = loadDefaultConfig();

// Single-instance lock (Feature 28.1.6): a second launch attempt quits
// immediately and focuses the already-running window instead of spawning a
// duplicate proxy server and BrowserWindow.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    let mainWindow = null;
    let transcodeServer = null;

    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    // macOS ignores `BrowserWindow.icon` entirely — the dock icon comes from
    // the bundle. A packaged `.app` carries `build/icon.icns`, but an
    // unpackaged `npm start` run has no bundle at all and would otherwise
    // show Electron's own icon in the dock.
    if (process.platform === 'darwin' && appIcon && app.dock) {
        app.dock.setIcon(appIcon);
    }

    // Renderer-driven window fullscreen (see `applySecurityPolicy`'s
    // fullscreen note). `send`, not `handle`: the renderer never needs a
    // reply, and the current state travels back on its own channel below so
    // the bridge can answer `isWindowFullscreen()` synchronously.
    ipcMain.on(IPC_SET_WINDOW_FULLSCREEN, (event, next) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;
        win.setFullScreen(Boolean(next));
    });

    // `handle`/`invoke`, not `additionalArguments`/argv: argv is visible to
    // any local process listing (`ps`), and a password shouldn't sit there
    // for the process lifetime when a simple round-trip avoids it entirely.
    ipcMain.handle(IPC_GET_DEFAULT_CONFIG, () => defaultConfig);

    registerDownloadHandlers();

    async function start() {
        const splash = createSplashWindow();

        // Loopback-only bind: never reachable from the network, so no
        // ALLOWED_HOSTS needed — this is not an open proxy.
        const { origin } = await createProxyServer({ host: '127.0.0.1', port: 0 });
        const transcode = await startTranscodeServer();

        mainWindow = new BrowserWindow({
            width: 1280,
            height: 800,
            minWidth: 720,
            minHeight: 480,
            backgroundColor: APP_BACKGROUND_COLOR,
            show: false,
            ...(appIcon ? { icon: appIcon } : {}),
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
                    // Absent when the transcode server didn't come up, which
                    // the preload reads as "this host cannot transcode" —
                    // the renderer then behaves exactly like the web build.
                    ...(transcode
                        ? [
                              `--thundertv-transcode-origin=${transcode.origin}`,
                              `--thundertv-transcode-token=${transcode.token}`,
                          ]
                        : []),
                ],
            },
        });

        applySecurityPolicy(mainWindow);
        publishFullscreenState(mainWindow);

        mainWindow.once('ready-to-show', () => {
            mainWindow?.show();
            if (!splash.isDestroyed()) splash.destroy();
        });

        await mainWindow.loadFile(resolveIndexHtml());
    }

    /**
     * The audio-transcode server (`transcode.mjs`) is a nice-to-have, not a
     * precondition: a build without the bundled ffmpeg, or a port that will
     * not bind, must still open the app — the renderer simply keeps the web
     * build's "this device has no decoder for this audio" behaviour.
     */
    async function startTranscodeServer() {
        try {
            const server = await createTranscodeServer({ host: '127.0.0.1', port: 0 });
            transcodeServer = server;
            return server;
        } catch (err) {
            console.error('[ThunderTV] audio transcoding unavailable:', err);
            return null;
        }
    }

    // Never leave an ffmpeg behind: `close()` kills whatever it is running
    // before dropping the listener.
    app.on('will-quit', () => {
        transcodeServer?.close();
        transcodeServer = null;
    });

    // `start()`'s own rejection is caught too, not just `whenReady()`'s —
    // it was previously fired with a bare `void`, so a failed `loadFile`
    // became an unhandled rejection and left an empty window on screen
    // instead of a diagnosable crash.
    app.whenReady()
        .then(start)
        .catch((err) => {
            console.error(err);
            app.quit();
        });

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

    // Feature 28.8.6: deny every permission request *except* fullscreen —
    // this app needs none of notifications/geolocation/media-device access
    // from the packaged renderer.
    //
    // `'fullscreen'` is not an optional extra here: in Electron, Chromium
    // routes `Element.requestFullscreen()` through this very handler, so a
    // blanket `callback(false)` rejects the promise and the player's
    // fullscreen button silently does nothing — which is exactly what
    // hardening this handler did to the desktop build. The default-deny
    // posture is unchanged for everything else; this is one named
    // allowance for a capability the app's own UI asks for on purpose,
    // from a renderer that can only ever load this app's own `file://`
    // page (the navigation lock above).
    // No `setPermissionCheckHandler` alongside it, deliberately: nothing
    // set one before this handler existed, and a deny-all check handler
    // would be a *new* denial surface rather than a fix for this one.
    win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(permission === 'fullscreen');
    });
}

/**
 * Keeps the renderer's cached "is the window fullscreen" answer in step
 * with reality, so `window.electron.isWindowFullscreen()` can stay
 * synchronous (the player's toggle runs inside a click handler and must
 * not spend the click's user activation waiting on IPC).
 *
 * Both events fire for HTML fullscreen too, since Electron takes the
 * window fullscreen when the page asks — which is fine: the renderer
 * checks `document.fullscreenElement` first and only consults this state
 * when nothing on the page owns the fullscreen.
 */
function publishFullscreenState(win) {
    const send = () => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return;
        win.webContents.send(IPC_WINDOW_FULLSCREEN_STATE, win.isFullScreen());
    };
    win.on('enter-full-screen', send);
    win.on('leave-full-screen', send);
    // A reload re-runs the preload with a fresh `false` cache, so re-state
    // it rather than assuming the enter/leave events cover every path.
    win.webContents.on('did-finish-load', send);
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
