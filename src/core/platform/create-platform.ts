import { createElectronPlatform } from './electron-platform';
import type { PlatformAdapter } from './platform-adapter';
import { createWebPlatform, type CreateWebPlatformOptions } from './web-platform';

/**
 * `window.electron` truthy → Electron adapter, otherwise the web adapter.
 * Identical in spirit to thunder-tv's `DataFactory()`.
 *
 * webOS is *not* a third branch (Feature 03.8.4): a packaged webOS build is
 * `WebPlatform` + the Phase 04 storage probe + the vendored import map swap
 * (masterplan §4) — no `isWebOS` sniffing exists or should be added here.
 *
 * Called exactly once, from `main.ts`, before state seeding and `run()`
 * (masterplan §4, §6.4). Detection reads `window.electron` a single time at
 * boot; Electron guarantees the preload script runs before app code, so
 * there is no late-injection case to guard against and no re-detection ever
 * happens (Feature 03.8.5).
 *
 * Both branches share the same options shape (`CreateWebPlatformOptions`)
 * on purpose — `createElectronPlatform()`'s collaborators are the same web
 * ones, so `bootstrap.ts` never has to branch on which one it's calling.
 * See `electron-platform.ts`'s header comment for the desktop adapter's
 * architecture decision (this used to throw — "not yet implemented" — even
 * though nothing ever set `window.electron`, so the throw was unreachable
 * and the desktop shell silently ran on this web branch the whole time).
 */
export async function createPlatform(options: CreateWebPlatformOptions = {}): Promise<PlatformAdapter> {
    if (window.electron) {
        return createElectronPlatform(options);
    }
    return createWebPlatform(options);
}
