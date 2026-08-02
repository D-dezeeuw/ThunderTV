import { WebHttpAdapter } from '../http/web-http-adapter';
import { createStorage } from '../storage';
import type { TierControllerOptions } from '../storage/tier-controller';
import { SETTINGS_PROXY_TEMPLATE } from '../../state/settings';
import { get } from '../../state/typed';
import { createElectronCapabilities } from './capabilities';
import { ElectronDownloadAdapter } from './electron-downloads';
import type { DefaultConfig, PlatformAdapter, WindowFullscreenControl } from './platform-adapter';
import { buildTranscodeStreamUrl, type AudioTranscodeControl } from './transcode-adapter';
import { WebFileAdapter } from './web-file-adapter';

/**
 * Architecture decision (masterplan Phase 28 vs. what actually shipped):
 * the full-scope plan was a main-process `net.request` HTTP passthrough
 * behind `window.electron.http.request()` IPC (`ElectronPlatformAdapter`
 * with its own `HttpAdapter`/chunked-streaming implementation). Instead,
 * this formalizes the simpler approach `desktop/main.mjs` already had
 * running (previously undocumented as a "real" adapter, and previously
 * *unreachable* — `create-platform.ts` threw on any `window.electron`
 * presence, and nothing ever set it, so the desktop shell silently ran the
 * web adapter the whole time): the embedded 127.0.0.1 proxy is the
 * platform's HTTP story, and `createElectronPlatform()` is just
 * `createWebPlatform()`'s collaborators (`WebHttpAdapter`, `WebFileAdapter`,
 * the same tiered `StorageAdapter`) wired to default their proxy template
 * to that embedded origin, with `capabilities.corsUnrestricted` reporting
 * `true` since the proxy does in fact make every request CORS-free from
 * the renderer's point of view.
 *
 * Why this over the full IPC HTTP adapter: smaller, safer diff against
 * everything already built on the current behavior (chunked streaming,
 * conditional-GET passthrough, and the classified-fetch error taxonomy all
 * already work end-to-end through `WebHttpAdapter`/`classifiedFetch` — an
 * IPC passthrough would have to re-implement or bridge all of that from
 * scratch for zero behavior change). Native file dialogs, main-process
 * error logging, and window-state persistence are still main-process-only
 * concerns and stay out of scope here; this file is only the platform
 * adapter's HTTP/capabilities story.
 */
export function effectiveProxyTemplate(): string | undefined {
    const saved = get<string | null>(SETTINGS_PROXY_TEMPLATE);
    if (saved) return saved;
    const origin = window.electron?.proxyOrigin;
    return origin ? `${origin}/{url}` : undefined;
}

/**
 * The desktop shell's window-fullscreen control, straight off the preload
 * bridge (`desktop/preload.cjs`). Both members are no-ops rather than
 * throws when the bridge is somehow absent — the toggle that calls this is
 * a UI affordance, and a missing bridge should leave the page-level
 * fullscreen path alone, not break the click.
 */
const windowFullscreen: WindowFullscreenControl = {
    isFullscreen: () => window.electron?.isWindowFullscreen() ?? false,
    setFullscreen: (next) => {
        window.electron?.setWindowFullscreen(next);
    },
};

/**
 * The audio-transcode route, if this build has one. Read once per adapter:
 * the bridge's `transcode` is a boot-time constant from the main process
 * (`desktop/main.mjs`'s `additionalArguments`), and its absence is the
 * honest "this host cannot transcode" — an older preload, or a main process
 * whose transcode server did not come up.
 */
function audioTranscodeControl(): AudioTranscodeControl | undefined {
    const bridge = window.electron?.transcode;
    if (!bridge?.origin || !bridge.token) return undefined;
    return {
        open: (sourceUrl, atSeconds, signal) =>
            // Not through `WebHttpAdapter`: that layer exists to classify
            // and *complete* a request, and this one is an endless body the
            // player reads for as long as the film lasts.
            fetch(buildTranscodeStreamUrl(bridge.origin, bridge.token, sourceUrl, atSeconds), {
                signal,
                cache: 'no-store',
            }),
    };
}

async function getDefaultConfig(): Promise<DefaultConfig> {
    const empty: DefaultConfig = { xtream: null, locale: null, liveCountry: null };
    return (await window.electron?.getDefaultConfig()) ?? empty;
}

export interface CreateElectronPlatformOptions {
    /** Forwarded to the storage tier controller — same shape as `CreateWebPlatformOptions` (`web-platform.ts`). */
    onStorageDemote?: TierControllerOptions['onDemote'];
    /**
     * Forwarded to `WebHttpAdapter`. `bootstrap.ts` passes the same
     * `() => effectiveProxyTemplate()` getter to `createPlatform()`
     * regardless of which branch it resolves to, so a user-saved proxy
     * template still overrides the desktop default here exactly as on web.
     */
    getProxyTemplate?: () => string | undefined;
}

/**
 * Assembles the Electron `PlatformAdapter`. Identical collaborators to
 * `createWebPlatform()` (same storage tiers, same `WebHttpAdapter`/
 * `WebFileAdapter`) — the only differences are `name: 'electron'`,
 * `capabilities.corsUnrestricted: true`, and `windowFullscreen`, which
 * exists here because this host has a window of its own to fullscreen. See
 * this file's header comment for why that's the whole adapter.
 */
export async function createElectronPlatform(options: CreateElectronPlatformOptions = {}): Promise<PlatformAdapter> {
    const storage = await createStorage({ onDemote: options.onStorageDemote });
    const audioTranscode = audioTranscodeControl();
    return {
        ...(audioTranscode ? { audioTranscode } : {}),
        name: 'electron',
        storage,
        http: new WebHttpAdapter(
            options.getProxyTemplate ? { getProxyTemplate: options.getProxyTemplate } : { getProxyTemplate: effectiveProxyTemplate },
        ),
        files: new WebFileAdapter(),
        // The one collaborator that is genuinely not the web one: the main
        // process streams the file to disk itself, so a movie never passes
        // through the renderer at all (`electron-downloads.ts`).
        downloads: new ElectronDownloadAdapter(),
        windowFullscreen,
        getDefaultConfig,
        get capabilities() {
            return createElectronCapabilities(storage.tier);
        },
    };
}
