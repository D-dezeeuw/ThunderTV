import { refs, watch } from 'spektrum';
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
        void attachAndPlay(video, active.streamUrl);
    });
}
