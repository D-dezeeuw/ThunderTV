import { setValue } from 'spektrum';

export const IMPORT_STATE = 'import.state';
export const IMPORT_PARSED = 'import.parsed';
export const IMPORT_WRITTEN = 'import.written';
export const IMPORT_SOURCE_NAME = 'import.sourceName';
export const IMPORT_ERROR_KIND = 'import.errorKind';
export const IMPORT_ERROR_MESSAGE = 'import.errorMessage';
export const IMPORT_SUMMARY = 'import.summary';

export type ImportStage = 'idle' | 'fetching' | 'reading' | 'parsing' | 'writing' | 'done' | 'error';

/** Rendered by Feature 07.6's result panel — cleared on navigation away (07.6.8). */
export interface ImportSummaryView {
    sourceId: string;
    total: number;
    groupCount: number;
    radioCount: number;
    drmCount: number;
    skipped: number;
    detectedEpgUrlCount: number;
    updated: boolean;
}

/**
 * Compact Spektrum scalars only (Feature 07.5.1) — never an array of
 * channel rows, matching the §5.8 discipline `state/bulk-policy.ts`
 * enforces everywhere else. `errorKind` mirrors `FetchFailureKind` (plus
 * `'m3u'` for a failed/empty parse) so the UI can pick the right retry
 * affordance (Feature 07.4/07.9) without re-deriving it from the message
 * string.
 */
export interface ImportState {
    state: ImportStage;
    parsed: number;
    written: number;
    sourceName: string | null;
    errorKind: string | null;
    errorMessage: string | null;
    summary: ImportSummaryView | null;
}

export const IMPORT_DEFAULTS: ImportState = {
    state: 'idle',
    parsed: 0,
    written: 0,
    sourceName: null,
    errorKind: null,
    errorMessage: null,
    summary: null,
};

export function initImportState(): void {
    setValue(IMPORT_STATE, IMPORT_DEFAULTS.state);
    setValue(IMPORT_PARSED, IMPORT_DEFAULTS.parsed);
    setValue(IMPORT_WRITTEN, IMPORT_DEFAULTS.written);
    setValue(IMPORT_SOURCE_NAME, IMPORT_DEFAULTS.sourceName);
    setValue(IMPORT_ERROR_KIND, IMPORT_DEFAULTS.errorKind);
    setValue(IMPORT_ERROR_MESSAGE, IMPORT_DEFAULTS.errorMessage);
    setValue(IMPORT_SUMMARY, IMPORT_DEFAULTS.summary);
}
