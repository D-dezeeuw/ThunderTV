import { SETTINGS_PROXY_TEMPLATE } from '../../state/settings';
import { get } from '../../state/typed';

/**
 * The desktop shell (Electron, `desktop/main.mjs`) embeds the proxy on
 * 127.0.0.1 and hands its origin to the renderer via the preload bridge as
 * `window.thunderDesktop.proxyOrigin`. Defaulting the proxy template to it
 * is the entire desktop integration: the whole validated web pipeline —
 * API calls, stream playback, manifest rewriting, logos — routes through
 * the local proxy and leaves from this machine's own IP, with the renderer
 * keeping every browser security default. A user-saved template still wins
 * (someone pointing the desktop app at a remote proxy on purpose), and in
 * a plain browser `window.thunderDesktop` is absent so behavior is
 * unchanged.
 */
export function effectiveProxyTemplate(): string | undefined {
    const saved = get<string | null>(SETTINGS_PROXY_TEMPLATE);
    if (saved) return saved;
    const origin = (window as { thunderDesktop?: { proxyOrigin?: string } }).thunderDesktop?.proxyOrigin;
    return origin ? `${origin}/{url}` : undefined;
}
