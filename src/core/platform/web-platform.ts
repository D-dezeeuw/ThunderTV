import { WebHttpAdapter } from '../http/web-http-adapter';
import { createStorage } from '../storage';
import type { TierControllerOptions } from '../storage/tier-controller';
import { createWebCapabilities } from './capabilities';
import type { PlatformAdapter } from './platform-adapter';
import { WebFileAdapter } from './web-file-adapter';

export interface CreateWebPlatformOptions {
    /** Forwarded to the storage tier controller (Feature 04.7.5) — lets `main.ts` react to a mid-session demotion (e.g. re-mirror `platform.capabilities`/`storage.tier` into Spektrum state) without `src/core/` importing the state framework. */
    onStorageDemote?: TierControllerOptions['onDemote'];
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
 * constructed without a `getProxyTemplate` getter, which is exactly this
 * platform's state until Settings (Phase 22) has a real template to read —
 * passing a getter that only ever returns `undefined` today would be dead
 * code, so none is passed here yet.
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
        http: new WebHttpAdapter(),
        files: new WebFileAdapter(),
        get capabilities() {
            return createWebCapabilities(storage.tier);
        },
    };
}
