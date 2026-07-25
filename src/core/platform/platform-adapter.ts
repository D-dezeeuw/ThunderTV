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
}
