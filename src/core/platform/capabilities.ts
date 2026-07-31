import { webDownloadSupport } from './web-downloads';

/**
 * Declared data, not scattered `if (isElectron)` checks — UX decisions
 * (CORS warnings, player options, storage notices) read from this object
 * instead of re-deriving the environment (masterplan §4).
 *
 * New capabilities are added as new fields with safe-false (or safe-'none')
 * defaults, never by widening the meaning of an existing field.
 */
export interface Capabilities {
    readonly corsUnrestricted: boolean;
    readonly externalPlayers: boolean;
    readonly durableStorage: 'full' | 'partial' | 'none';
    /**
     * How well this host can save a VOD title to disk — and therefore
     * whether the download queue's progress bar and Cancel button mean
     * anything:
     *
     * - `'managed'`: the transfer runs under our control (Electron's main
     *   process, or the web's File System Access streaming path), so bytes
     *   are counted and a cancel really stops it.
     * - `'handoff'`: the file is passed to the browser's own download
     *   manager, which the page cannot observe or stop. The queue shows the
     *   entry as handed over rather than faking a percentage.
     * - `'none'`: no download path at all. Not produced by either shipping
     *   platform today; it exists so the safe-default rule above has a
     *   value to name, and so the UI's gate is a capability check rather
     *   than an environment check.
     */
    readonly downloads: 'managed' | 'handoff' | 'none';
}

/**
 * Web values. `externalPlayers` is always false in a browser.
 * `durableStorage` comes from the Phase 04 boot-time storage probe (a
 * temporary stub reports `'none'` until then, per Feature 03.2.3, so nothing
 * can assume persistence that doesn't exist yet).
 *
 * `corsUnrestricted` used to be hardcoded false here, commented "no consumer
 * should ever need to override them for this platform". That stopped being
 * true once every cross-origin path learned to route through the configured
 * proxy: the HTTP adapter (`web-http-adapter.ts`), the stream URL handed to
 * the player (`src/player/bindings.ts`), channel logos
 * (`src/state/list-publish.ts`), and — via the manifest rewriting in
 * `scripts/cloudflare-cors-proxy.mjs` — the HLS segments too. With a proxy
 * set, a browser is in exactly the position `createElectronCapabilities()`
 * already reports `true` for, and for the same reason: the mechanism differs,
 * the honest capability does not. Leaving it false made the app warn about a
 * limitation the user had already paid to remove.
 *
 * `proxyConfigured` defaults to false, so a caller that knows nothing about
 * the proxy still gets the old, safe answer — this is a new narrow input, not
 * a widened meaning of an existing field.
 */
export function createWebCapabilities(
    durableStorage: Capabilities['durableStorage'],
    proxyConfigured = false,
): Capabilities {
    return Object.freeze({
        corsUnrestricted: proxyConfigured,
        externalPlayers: false,
        durableStorage,
        // Feature-detected, not assumed: `webDownloadSupport()` reports
        // `'managed'` only where `showSaveFilePicker` actually exists
        // (Chromium/Edge), and `'handoff'` on the browsers where the only
        // option is handing the URL to the download manager.
        downloads: webDownloadSupport(),
    });
}

/**
 * Desktop values: `corsUnrestricted` is `true` here — not because the
 * renderer itself skips CORS (it doesn't; browser defaults stay on, per
 * `desktop/main.mjs`'s security hardening), but because every request that
 * matters is routed through the proxy `desktop/main.mjs` embeds on
 * 127.0.0.1 (`src/core/platform/electron-platform.ts`), which fetches from
 * the main process and re-serves same-origin to the renderer. The net
 * effect for every caller gating on this flag (the CORS warning surface,
 * import flows) is identical to a real CORS-free HTTP adapter, so the flag
 * reports the true, honest capability rather than the mechanism. See that
 * module's header comment for the full architecture decision.
 */
export function createElectronCapabilities(durableStorage: Capabilities['durableStorage']): Capabilities {
    return Object.freeze({
        corsUnrestricted: true,
        externalPlayers: false,
        durableStorage,
        // Always the real thing here — the main process streams the file to
        // disk itself (`electron-downloads.ts`), so there is no
        // browser-support axis to feature-detect.
        downloads: 'managed',
    });
}
