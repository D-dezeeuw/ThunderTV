import type { PlatformAdapter } from './platform-adapter';

let instance: PlatformAdapter | null = null;

/** Called exactly once, from `main.ts`, right after `createPlatform()` resolves — throws on a second call so double-initialization fails loudly instead of silently swapping the adapter mid-session. */
export function setPlatform(platform: PlatformAdapter): void {
    if (instance) {
        throw new Error('setPlatform() called twice — the platform adapter is constructed once at boot.');
    }
    instance = platform;
}

/** Throws before `setPlatform()` has run. Every real caller executes after boot, so this is a programmer-error guard, not a runtime branch application code needs to handle. */
export function getPlatform(): PlatformAdapter {
    if (!instance) {
        throw new Error('getPlatform() called before setPlatform() — the platform must be set during boot in main.ts.');
    }
    return instance;
}

/** Test-only: clears the singleton so specs can call `setPlatform()` again without restarting the process. Never call from app code — see `withFakePlatform` in `fake-platform.ts` for the sanctioned test pattern. */
export function resetPlatformForTests(): void {
    instance = null;
}

export { createPlatform } from './create-platform';
export type { CreateWebPlatformOptions } from './web-platform';
export type { Capabilities } from './capabilities';
export type { FileAdapter, PickedFile, ReadTextResult } from './file-adapter';
export type { PlatformAdapter, WindowFullscreenControl } from './platform-adapter';
export type { HttpAdapter, HttpRequestOptions } from '../http/http-adapter';
