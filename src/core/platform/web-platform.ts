import { WebHttpAdapter } from '../http/web-http-adapter';
import { createStorage } from '../storage';
import type { TierControllerOptions } from '../storage/tier-controller';
import { createWebCapabilities } from './capabilities';
import type { PlatformAdapter } from './platform-adapter';
import { WebDownloadAdapter } from './web-downloads';
import { WebFileAdapter } from './web-file-adapter';

export interface CreateWebPlatformOptions {
    /** Forwarded to the storage tier controller (Feature 04.7.5) — lets `main.ts` react to a mid-session demotion (e.g. re-mirror `platform.capabilities`/`storage.tier` into Spektrum state) without `src/core/` importing the state framework. */
    onStorageDemote?: TierControllerOptions['onDemote'];
    /**
     * Forwarded to `WebHttpAdapter` (Feature 07.8.1/03.6.3) — same
     * dependency-injection shape as `onStorageDemote` above, so
     * `src/core/` still never imports the state framework directly.
     * `bootstrap.ts` passes a getter reading `settings.proxyTemplate`;
     * it's only ever *called* well after `initState()` has run (the
     * first real HTTP request happens from user interaction, not at
     * platform-construction time), so the getter being wired before
     * Spektrum state exists yet is safe.
     */
    getProxyTemplate?: () => string | undefined;
}

/**
 * Assembles the web `PlatformAdapter`: `WebHttpAdapter`, `WebFileAdapter`,
 * the real boot-probed `StorageAdapter` (Phase 04's `createStorage()`), and
 * capabilities.
 *
 * `capabilities` is a *live getter*, not a field snapshotted once — reading
 * it always derives `durableStorage` from `storage.tier` (which itself
 * reflects the tier controller's current active adapter). This makes
 * "capabilities.durableStorage reports the live tier" (this phase's own
 * verification line) true by construction: there is no separate cached
 * value that could drift from the real tier after a demotion.
 *
 * `WebHttpAdapter` defaults to "no proxy configured" (Feature 03.6.3) when
 * constructed without a `getProxyTemplate` getter — `bootstrap.ts` now
 * passes a real one (Feature 07.8.1).
 *
 * Feature 03.3.5 asks collaborator construction to degrade rather than
 * white-screen on failure. `WebHttpAdapter` and `WebFileAdapter`'s
 * constructors only assign fields — nothing here can throw for any input —
 * so a catch-and-degrade branch would guard a path that's structurally
 * unreachable (dead defensive code). `createStorage()` itself never
 * rejects (every probe failure mode already resolves `false`, landing on
 * the `MemoryStorage` floor), so the same reasoning applies to it too.
 */
export async function createWebPlatform(options: CreateWebPlatformOptions = {}): Promise<PlatformAdapter> {
    const storage = await createStorage({ onDemote: options.onStorageDemote });
    return {
        name: 'web',
        storage,
        http: new WebHttpAdapter(options.getProxyTemplate ? { getProxyTemplate: options.getProxyTemplate } : {}),
        files: new WebFileAdapter(),
        downloads: new WebDownloadAdapter(),
        get capabilities() {
            return createWebCapabilities(storage.tier);
        },
    };
}
