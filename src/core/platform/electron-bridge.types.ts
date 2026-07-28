/**
 * The one shared contract for `window.electron` — written once here and
 * consumed by three places that must never drift apart:
 *   - `desktop/preload.cjs` (the `contextBridge.exposeInMainWorld` call)
 * - `src/types/platform.d.ts` (the ambient `Window.electron` declaration)
 *   - `src/core/platform/electron-platform.ts` (the adapter that reads it)
 *
 * `desktop/preload.cjs` is plain CommonJS (Electron preload scripts must be,
 * see that file's own comment) so it cannot literally `import` this type —
 * but its JSDoc references this file by path, and this shape is the one
 * both sides are reviewed against. Keep it minimal (Feature 28.2.5's
 * "minimal-surface rule"): only what the app actually needs today.
 *
 * Architecture decision (see `src/core/platform/README.md`): rather than
 * building a full main-process `net.request` HTTP passthrough behind a
 * `window.electron.http.request()` IPC round-trip (masterplan Feature
 * 28.4's full scope), the desktop shell embeds the proven proxy pipeline on
 * 127.0.0.1 and hands the renderer its origin. `proxyOrigin` is therefore
 * still the entire bridge surface — this file just gives that one field a
 * name and a home instead of the `unknown`/ad hoc-shaped stand-in Phase 03
 * left behind.
 */
export interface ElectronBridge {
    /** Origin (`http://127.0.0.1:<port>`) of the proxy embedded by `desktop/main.mjs`, loopback-only. */
    readonly proxyOrigin: string;
    /** `app.getVersion()` at preload time — surfaced for diagnostics/About, never for feature gating. */
    readonly appVersion: string;
}
