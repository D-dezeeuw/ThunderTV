import { WebHttpAdapter } from '../http/web-http-adapter';
import type { StorageAdapter } from '../storage/storage-adapter';
import { createWebCapabilities } from './capabilities';
import type { PlatformAdapter } from './platform-adapter';
import { WebFileAdapter } from './web-file-adapter';

/**
 * Temporary in-memory storage stub. Phase 04 replaces this with the real
 * tiered `StorageAdapter` (IndexedDB → localStorage → memory, boot-probed).
 * Reports `durableStorage: 'none'` honestly (Feature 03.2.3) — nothing
 * written through this stub survives a reload.
 */
function createStorageStub(): StorageAdapter {
    const memory = new Map<string, unknown>();
    return {
        get<T>(key: string) {
            return Promise.resolve(memory.get(key) as T | undefined);
        },
        set<T>(key: string, value: T) {
            memory.set(key, value);
            return Promise.resolve();
        },
        delete(key: string) {
            memory.delete(key);
            return Promise.resolve();
        },
        clear() {
            memory.clear();
            return Promise.resolve();
        },
    };
}

/**
 * Assembles the web `PlatformAdapter`: `WebHttpAdapter`, `WebFileAdapter`,
 * the in-memory storage stub above, and fixed web capabilities.
 *
 * `WebHttpAdapter` defaults to "no proxy configured" (Feature 03.6.3) when
 * constructed without a `getProxyTemplate` getter, which is exactly this
 * platform's state until Settings (Phase 22) has a real template to read —
 * passing a getter that only ever returns `undefined` today would be dead
 * code, so none is passed here yet.
 *
 * Returns a `Promise` (rather than being declared `async`, which would trip
 * `@typescript-eslint/require-await` with nothing yet to `await`) so Phase
 * 04 can insert a real `await` for the storage probe without changing this
 * function's call signature.
 *
 * Feature 03.3.5 asks collaborator construction to degrade rather than
 * white-screen on failure. `WebHttpAdapter` and `WebFileAdapter`'s
 * constructors only assign fields — nothing here can throw for any input —
 * so a catch-and-degrade branch would guard a path that's structurally
 * unreachable (dead defensive code). Reassess if a future collaborator
 * gains a constructor that can actually fail.
 */
export function createWebPlatform(): Promise<PlatformAdapter> {
    return Promise.resolve({
        name: 'web',
        storage: createStorageStub(),
        http: new WebHttpAdapter(),
        files: new WebFileAdapter(),
        capabilities: createWebCapabilities('none'),
    });
}
