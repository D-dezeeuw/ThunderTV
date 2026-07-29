import { setValue } from 'spektrum';

/**
 * Settings-facing state for shared Codexes (Phase 37, stone 10).
 *
 * Same rule as `codex.ts`: the documents themselves never enter Spektrum
 * state. What lives here is the small view model the subscription list
 * renders plus one-shot feedback — retained Codexes are storage-owned bulk
 * data, and parking a 90,000-claim file in a reactive key would make every
 * unrelated settings render walk it.
 */
export const CODEX_LIBRARY_ROWS = 'settings.codexLibraryRows';
export const CODEX_LIBRARY_STATE = 'settings.codexLibraryState';
export const CODEX_LIBRARY_MESSAGE = 'settings.codexLibraryMessage';
export const CODEX_BLOCKED_ROWS = 'settings.codexBlockedRows';

export type CodexLibraryUiState = 'idle' | 'busy' | 'done' | 'failed';

/** One row of the subscription list, flattened for the template — Spektrum's `data-each` reads plain fields, not nested objects. */
export interface CodexLibraryRow {
    url: string;
    authorId: string;
    /** Pre-composed "n · m" counts, so the template needs no formatting logic. */
    counts: string;
    problem: string;
    blocked: boolean;
}

export interface CodexBlockedRow {
    authorId: string;
}

export function initCodexLibraryState(): void {
    setValue(CODEX_LIBRARY_ROWS, [] satisfies CodexLibraryRow[]);
    setValue(CODEX_LIBRARY_STATE, 'idle' satisfies CodexLibraryUiState);
    setValue(CODEX_LIBRARY_MESSAGE, '');
    setValue(CODEX_BLOCKED_ROWS, [] satisfies CodexBlockedRow[]);
}
