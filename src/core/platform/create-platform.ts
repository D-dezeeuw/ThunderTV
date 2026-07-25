import type { PlatformAdapter } from './platform-adapter';
import { createWebPlatform, type CreateWebPlatformOptions } from './web-platform';

/**
 * `window.electron` truthy → Electron adapter (Phase 28); otherwise the web
 * adapter. Identical in spirit to thunder-tv's `DataFactory()`.
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
 */
export async function createPlatform(options: CreateWebPlatformOptions = {}): Promise<PlatformAdapter> {
    if (window.electron) {
        throw new Error('The Electron platform adapter is not yet implemented (arrives in Phase 28).');
    }
    return createWebPlatform(options);
}
