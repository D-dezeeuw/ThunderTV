import { refs, watch } from 'spektrum';
import { applyProxy } from '../core/http/proxy';
import { effectiveProxyTemplate } from '../core/platform/desktop-proxy';
import { PLAYER_ACTIVE } from '../state/player';
import { attachAndPlay, detach } from './engine';

/**
 * Watches `player.active` (already fully wired by Phase 05/08's
 * `setActiveChannel`/`playSelected`) and drives the real `<video>` element
 * — the one piece Phase 10 hadn't built yet. `data-if="player.active"` in
 * `index.html` mounts/unmounts `[data-ref="playerVideo"]`, so the element
 * may not exist yet on a given tick; this re-reads `refs` on every change
 * rather than capturing it once. The `player/stop` `defineFn` itself lives
 * in `src/state/player.actions.ts` (the `setValue()` fence, Feature 05.2.5).
 *
 * MVP deviation from Feature 19.9.3 (streams unproxied by default, behind a
 * separate toggle): a configured proxy template applies to the stream URL
 * too. Without it, an http:// provider can never play from the
 * https-deployed page (mixed content blocks hls.js's own fetches, which
 * bypass the HTTP adapter entirely — Feature 03.6.8's documented caveat).
 * A manifest-rewriting proxy (scripts/cloudflare-cors-proxy.mjs) keeps
 * segment URIs flowing through the proxy as well; the dedicated
 * streams-toggle arrives with the Phase 22 settings work.
 */
export function registerPlayerBindings(): () => void {
    return watch([PLAYER_ACTIVE], (state: unknown) => {
        const active = (state as { player?: { active?: { streamUrl: string } | null } }).player?.active;
        const video = refs['playerVideo'];
        if (!(video instanceof HTMLVideoElement)) return;

        if (!active) {
            detach(video);
            return;
        }
        void attachAndPlay(video, applyProxy(effectiveProxyTemplate(), active.streamUrl));
        revealPlayer(video);
    });
}

/**
 * The player sits above the list; on a phone the user who just tapped a
 * channel is scrolled somewhere inside it. Double-rAF so the `data-if`
 * reveal has applied (same pattern as `focusImportProgress()`), then a
 * plain instant `scrollIntoView` — `block: 'nearest'` makes it a no-op when
 * the player is already visible (desktop Enter-to-play stays still).
 */
function revealPlayer(video: HTMLVideoElement): void {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            (video.closest('.player-shell') ?? video).scrollIntoView({ block: 'nearest' });
        });
    });
}
