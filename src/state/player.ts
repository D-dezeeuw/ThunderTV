import { setValue } from 'spektrum';
import type { ActiveChannelSnapshot } from './records';

/** Feature 05.1.2: dotted, module-prefixed key constants — no string literals at call sites. */
export const PLAYER_ACTIVE = 'player.active';
export const PLAYER_ZAP_HISTORY = 'player.zapHistory';

/** Feature 05.5.3: capped at 20 entries; the Recent view (Phase 13) may trim its own display further. */
export const ZAP_HISTORY_CAP = 20;

export interface PlayerState {
    active: ActiveChannelSnapshot | null;
    zapHistory: ActiveChannelSnapshot[];
}

export const PLAYER_DEFAULTS: PlayerState = {
    active: null,
    zapHistory: [],
};

/** Seeds this module's defaults — called once from `state/index.ts`'s `initState()`, before rehydration can overwrite it (Feature 05.1.8). */
export function initPlayerState(): void {
    setValue(PLAYER_ACTIVE, PLAYER_DEFAULTS.active);
    setValue(PLAYER_ZAP_HISTORY, PLAYER_DEFAULTS.zapHistory);
}
