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
    /**
     * Whether the desktop window is currently fullscreen. Synchronous on
     * purpose (the preload mirrors main-process events into a local cache):
     * the player's fullscreen toggle runs inside a click handler, and an
     * `await` there would spend the click's transient user activation
     * before `requestFullscreen()` ever ran.
     */
    isWindowFullscreen(): boolean;
    /**
     * Takes the desktop window itself in or out of fullscreen — the
     * fallback for when page-level fullscreen doesn't happen (see
     * `src/state/player.actions.ts`'s `player/fullscreen`). Fire-and-forget;
     * the resulting state arrives back through `isWindowFullscreen()`.
     */
    setWindowFullscreen(next: boolean): void;
    /**
     * Default first-run config read from a gitignored `desktop/.env` at
     * startup — `THUNDERTV_XTREAM_URL`/`_USERNAME`/`_PASSWORD` (all three
     * required together, else `xtream` is `null`), `THUNDERTV_LOCALE`
     * (`'en'|'nl'|'de'`), `THUNDERTV_LIVE_COUNTRY` (a Live-filter country
     * code). Each field is independently `null` when unset. Dev-convenience
     * only — `.env` sits outside `electron-builder.yml`'s files allowlist, so
     * a packaged build always resolves all-null fields. `bootstrap.ts` applies
     * these as pre-filled first-run-wizard answers, only while the wizard
     * would otherwise open.
     */
    getDefaultConfig(): Promise<DefaultElectronConfig>;
    /**
     * Saving a movie to disk from the main process. This is the one part of
     * the bridge that is more than a value read, and it earns that: the
     * alternative is pulling a multi-gigabyte file through the renderer's
     * fetch stack to write it back out again. See
     * `src/core/platform/electron-downloads.ts` for the adapter on this side
     * and `desktop/main.mjs` for the implementation on the other.
     */
    readonly downloads: ElectronDownloadBridge;
}

export interface ElectronDownloadBridge {
    /** Native save dialog. Resolves the chosen absolute path, or `null` when the viewer dismisses it. */
    prepare(filename: string): Promise<string | null>;
    /** Fire-and-forget: every outcome, progress included, comes back on `onEvent` keyed by `id`. */
    start(id: string, url: string, filePath: string): void;
    /** Idempotent — cancelling an id that already finished is a no-op in the main process, not an error. */
    cancel(id: string): void;
    /** Returns its own unsubscribe, matching every other listener contract in the app. */
    onEvent(listener: (event: ElectronDownloadEvent) => void): () => void;
}

/**
 * One channel for every download, discriminated by `id` — a queue with
 * several prepared entries must never cross-talk, and a single channel with
 * an id is simpler to reason about than a channel per transfer.
 */
export type ElectronDownloadEvent =
    | { id: string; kind: 'progress'; receivedBytes: number; totalBytes: number | null }
    | { id: string; kind: 'done' }
    | { id: string; kind: 'error'; reason: 'network' | 'disk' | 'cancelled' };

export interface DefaultElectronConfig {
    xtream: { url: string; username: string; password: string } | null;
    locale: string | null;
    liveCountry: string | null;
}
