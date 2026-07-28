import type { ElectronBridge } from '../core/platform/electron-bridge.types';

export {};

declare global {
    interface Window {
        /**
         * Presence *and* shape now matter: `window.electron` truthy selects
         * the Electron platform adapter in `createPlatform()`
         * (`src/core/platform/create-platform.ts`), and the adapter reads
         * `proxyOrigin`/`appVersion` off it — see `ElectronBridge`'s own
         * comment for the preload/adapter contract this type pins down
         * (Phase 28's MVP slice, formalized).
         */
        electron?: ElectronBridge;
    }
}
