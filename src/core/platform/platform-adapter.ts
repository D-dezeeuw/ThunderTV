import type { HttpAdapter } from '../http/http-adapter';
import type { StorageAdapter } from '../storage/storage-adapter';
import type { Capabilities } from './capabilities';
import type { DownloadAdapter } from './download-adapter';
import type { FileAdapter } from './file-adapter';
import type { AudioTranscodeControl } from './transcode-adapter';

/**
 * The single interface every environment-specific concern is injected
 * behind (masterplan §4) — mirrors thunder-tv's `DataFactory()`/`DataService`
 * pattern. Constructed exactly once, in `main.ts`, via `createPlatform()`,
 * and passed down through `setPlatform()`/`getPlatform()` (`./index.ts`). No
 * module outside `src/core/platform/` may construct or import a concrete
 * platform implementation directly — always go through `getPlatform()`.
 *
 * Deliberately excludes anything Electron-only (external players, native
 * dialogs) from v1 — that arrives as new capability flags and, if truly
 * platform-specific, new adapter methods added when a real consumer needs
 * them, never speculatively (Feature 03.1.7).
 */
export interface PlatformAdapter {
    /** For diagnostics only (Feature 03.8.6) — never for feature gating. Gate features on `capabilities`. */
    readonly name: 'web' | 'electron';
    storage: StorageAdapter;
    http: HttpAdapter;
    files: FileAdapter;
    /**
     * Saving a VOD title to disk. Unlike `windowFullscreen` below this is
     * non-optional, because both hosts can do *something* — the difference
     * is how well, which `capabilities.downloads` reports and the UI gates
     * on. See `download-adapter.ts` for why `prepare()` and `start()` are
     * two calls rather than one.
     */
    downloads: DownloadAdapter;
    capabilities: Capabilities;
    /**
     * Present only on a host that owns a window of its own to fullscreen —
     * the Electron shell. Absent on web, where the page is a guest in
     * somebody else's browser window and page-level fullscreen is the only
     * fullscreen there is. This is the "new adapter method added when a
     * real consumer needs it" case the header comment describes: the
     * player's fullscreen toggle (`src/state/player.actions.ts`) falls back
     * to it when page-level fullscreen doesn't take.
     */
    windowFullscreen?: WindowFullscreenControl;
    /**
     * Present only on a host that can re-encode a film's audio while it
     * plays — the Electron shell, which bundles ffmpeg. Absent everywhere
     * else, which is what `src/player/transcode-fallback.ts` gates on. See
     * `transcode-adapter.ts` for why this is an optional member rather than
     * a `capabilities` flag.
     */
    audioTranscode?: AudioTranscodeControl;
    /**
     * Present only on the Electron adapter (`electron-platform.ts`), backed by
     * `window.electron.getDefaultConfig()`. See that bridge method's comment
     * for the dev-only/never-packaged guarantee. Always resolves a
     * well-formed object with independently-nullable fields, never `null`
     * itself.
     */
    getDefaultConfig?(): Promise<DefaultConfig>;
}

/** @see PlatformAdapter.windowFullscreen */
export interface WindowFullscreenControl {
    /** Synchronous by design — the toggle runs inside a click handler, where an `await` would spend the click's transient user activation. */
    isFullscreen(): boolean;
    setFullscreen(next: boolean): void;
}

/** @see PlatformAdapter.getDefaultConfig */
export interface XtreamAccountDefaults {
    url: string;
    username: string;
    password: string;
}

/** @see PlatformAdapter.getDefaultConfig */
export interface DefaultConfig {
    xtream: XtreamAccountDefaults | null;
    locale: string | null;
    liveCountry: string | null;
}
