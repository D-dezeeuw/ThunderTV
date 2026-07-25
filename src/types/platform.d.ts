export {};

declare global {
    interface Window {
        /**
         * Presence (not shape) is all Phase 03 needs: `window.electron`
         * truthy selects the Electron platform adapter in `createPlatform()`
         * (`src/core/platform/create-platform.ts`). The real preload bridge
         * type arrives in Phase 28 — kept opaque here so detection compiles
         * strictly without inventing an API surface early (Feature 03.8.2).
         */
        electron?: unknown;
    }
}
