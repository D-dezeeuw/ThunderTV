import {
    IMPORT_DEFAULTS,
    IMPORT_ERROR_KIND,
    IMPORT_ERROR_MESSAGE,
    IMPORT_PARSED,
    IMPORT_SOURCE_NAME,
    IMPORT_STATE,
    IMPORT_SUMMARY,
    IMPORT_WRITTEN,
    type ImportStage,
    type ImportSummaryView,
} from './import';
import { set } from './typed';

/**
 * Plain, directly-callable setter functions (Feature 05.2.7) — the
 * `src/m3u/import.ts` pipeline calls these to report progress instead of
 * calling `setValue()` itself, which the Feature 05.2.5 ESLint fence
 * forbids outside `src/state/`. Kept in their own file (not
 * `playlist.actions.ts`) so `src/m3u/import.ts` never has to import a file
 * that itself imports back into `src/m3u/` — see that file's own comment
 * for the full dependency-direction reasoning.
 */
export function setImportStage(stage: ImportStage): void {
    set(IMPORT_STATE, stage);
}

export function setImportProgress(parsed: number): void {
    set(IMPORT_PARSED, parsed);
}

export function setImportWritten(written: number): void {
    set(IMPORT_WRITTEN, written);
}

export function setImportSourceName(name: string | null): void {
    set(IMPORT_SOURCE_NAME, name);
}

export function setImportError(kind: string, message: string | null = null): void {
    set(IMPORT_ERROR_KIND, kind);
    set(IMPORT_ERROR_MESSAGE, message);
    set(IMPORT_STATE, 'error' satisfies ImportStage);
}

export function setImportSummary(summary: ImportSummaryView): void {
    set(IMPORT_SUMMARY, summary);
    set(IMPORT_STATE, 'done' satisfies ImportStage);
}

/** Feature 07.9.5 — cancel/clear-summary both return to the exact idle defaults. */
export function resetImportState(): void {
    set(IMPORT_STATE, IMPORT_DEFAULTS.state);
    set(IMPORT_PARSED, IMPORT_DEFAULTS.parsed);
    set(IMPORT_WRITTEN, IMPORT_DEFAULTS.written);
    set(IMPORT_SOURCE_NAME, IMPORT_DEFAULTS.sourceName);
    set(IMPORT_ERROR_KIND, IMPORT_DEFAULTS.errorKind);
    set(IMPORT_ERROR_MESSAGE, IMPORT_DEFAULTS.errorMessage);
    set(IMPORT_SUMMARY, IMPORT_DEFAULTS.summary);
}
