import { computed, type State } from 'spektrum';
import { strings } from '../app/strings';
import { PLAYER_STREAM_HEALTH, PLAYER_ZAP_HISTORY } from './player';
import { SETTINGS_LOCALE } from './settings';

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

    /**
     * Tooltip/label for the player-bar signal bars — the readable half of
     * `player.streamHealth`. `SETTINGS_LOCALE` is an added dep so a live
     * language switch (`strings` is a reassigned singleton, not a Spektrum
     * key) refreshes this label immediately.
     */
    computed('streamHealthLabel', [PLAYER_STREAM_HEALTH, SETTINGS_LOCALE], (state: State) => {
        const health = (state as { player?: { streamHealth?: string | null } }).player?.streamHealth;
        if (health === 'poor') return strings.list.signalPoor;
        if (health === 'fair') return strings.list.signalFair;
        return strings.list.signalGood;
    });
}
