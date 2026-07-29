import { setValue } from 'spektrum';

/**
 * Settings-facing state for the Codex (Phase 34, stone 4). Feedback only —
 * the document itself is built on demand and handed straight to a download,
 * never parked in Spektrum state.
 */
export const CODEX_STATE = 'settings.codexState';
/** Human-readable outcome line: claim counts on success, the specific reason on failure. */
export const CODEX_MESSAGE = 'settings.codexMessage';
/** This device's own author fingerprint, once an identity exists. */
export const CODEX_AUTHOR_ID = 'settings.codexAuthorId';

export type CodexUiState = 'idle' | 'busy' | 'done' | 'failed';

export function initCodexState(): void {
    setValue(CODEX_STATE, 'idle' satisfies CodexUiState);
    setValue(CODEX_MESSAGE, '');
    setValue(CODEX_AUTHOR_ID, '');
}
