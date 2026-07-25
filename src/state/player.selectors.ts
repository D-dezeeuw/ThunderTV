import { computed, type State } from 'spektrum';
import { PLAYER_ZAP_HISTORY } from './player';

/**
 * The third selector module named by Feature 05.6.1 alongside
 * `playlist.selectors.ts`/`ui.selectors.ts`. `hasNoZapHistory` is the gate
 * the Recent view's stub (Feature 05.4.6/05.5.6) uses to switch between its
 * empty state and the `data-each` list of `player.zapHistory` snapshots —
 * the cache's first visible consumer, ahead of Phase 13's real recent UI.
 */
export function registerPlayerSelectors(): void {
    computed('hasNoZapHistory', [PLAYER_ZAP_HISTORY], (state: State) => {
        const zapHistory = (state as { player?: { zapHistory?: unknown[] } }).player?.zapHistory;
        return !zapHistory || zapHistory.length === 0;
    });
}
