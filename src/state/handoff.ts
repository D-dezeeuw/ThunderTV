import { setValue } from 'spektrum';

/**
 * Handoff feedback (Phase 38, stone 9).
 *
 * The link itself *is* published, unlike the Codex document — it is a short
 * string, and the whole point is for the user to be able to see and copy it
 * when the clipboard is unavailable (which is most TV webviews, and any
 * page not served over HTTPS).
 */
export const HANDOFF_LINK = 'player.handoffLink';
export const HANDOFF_STATE = 'player.handoffState';
export const HANDOFF_MESSAGE = 'player.handoffMessage';

export type HandoffUiState = 'idle' | 'offered' | 'arrived' | 'failed';

export function initHandoffState(): void {
    setValue(HANDOFF_LINK, '');
    setValue(HANDOFF_STATE, 'idle' satisfies HandoffUiState);
    setValue(HANDOFF_MESSAGE, '');
}
