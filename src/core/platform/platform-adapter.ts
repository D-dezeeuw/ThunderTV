import type { HttpAdapter } from '../http/http-adapter';
import type { StorageAdapter } from '../storage/storage-adapter';
import type { Capabilities } from './capabilities';
import type { FileAdapter } from './file-adapter';

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
     * Present only on the Electron adapter (`electron-platform.ts`), backed by
     * `window.electron.getDefaultXtreamAccount()`. See that bridge method's
     * comment for the dev-only/never-packaged guarantee.
     */
    getDefaultXtreamAccount?(): Promise<XtreamAccountDefaults | null>;
}

/** @see PlatformAdapter.windowFullscreen */
export interface WindowFullscreenControl {
    /** Synchronous by design — the toggle runs inside a click handler, where an `await` would spend the click's transient user activation. */
    isFullscreen(): boolean;
    setFullscreen(next: boolean): void;
}

/** @see PlatformAdapter.getDefaultXtreamAccount */
export interface XtreamAccountDefaults {
    url: string;
    username: string;
    password: string;
}
