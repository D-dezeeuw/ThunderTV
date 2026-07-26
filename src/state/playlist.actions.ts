import { defineFn, refs } from 'spektrum';
import {
    cancelImport,
    importPlaylistFile,
    importPlaylistText,
    importPlaylistUrl,
    isImportInFlight,
} from '../m3u/import';
import { getPlatform } from '../core/platform';
import { M3U_ACCEPT } from '../core/platform/web-file-adapter';
import { resetImportState, setImportError, setImportSourceName, setImportStage } from './import-setters';

/**
 * The real Phase 07 import triggers (Feature 07.1.9/07.9.1), replacing the
 * Feature 03.7.10 file-picker proof this module held through Phase 05. URL
 * and paste both read their input imperatively via `refs` on submit —
 * uncontrolled, no `data-model` binding (Feature 07.3.1) — so a 100k-line
 * paste never touches Spektrum state or its time-travel history (§5.8).
 * Every handler is single-flight-guarded here too (not just inside
 * `runImport()`) so a rapid double-click never even reaches the pipeline.
 */
export function registerPlaylistActions(): void {
    defineFn('playlist/importFile', () => {
        void triggerFileImport();
    });
    defineFn('playlist/importUrl', () => {
        void triggerUrlImport(refValue('urlInput'));
    });
    defineFn('playlist/importText', () => {
        void triggerTextImport(refValue('pasteTextarea'));
    });
    defineFn('import/cancel', () => {
        cancelImport();
    });
    defineFn('import/clearSummary', () => {
        resetImportState();
    });
}

function refValue(name: string): string {
    const el = refs[name];
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : '';
}

export async function triggerFileImport(): Promise<void> {
    if (isImportInFlight()) return;
    const picked = await getPlatform().files.pickFile(M3U_ACCEPT);
    if (!picked) return;

    setImportSourceName(picked.name);
    setImportStage('reading');
    const outcome = await importPlaylistFile(picked.file);
    reportNonSummaryOutcome(outcome);
}

export async function triggerUrlImport(url: string): Promise<void> {
    if (isImportInFlight() || !url.trim()) return;
    setImportSourceName(url);
    setImportStage('fetching');
    const outcome = await importPlaylistUrl(url.trim());
    reportNonSummaryOutcome(outcome);
}

export async function triggerTextImport(text: string): Promise<void> {
    if (isImportInFlight() || !text.trim()) return;
    setImportStage('parsing');
    const outcome = await importPlaylistText(text);
    reportNonSummaryOutcome(outcome);
}

/**
 * `runImport()` already sets `import.state`/`summary`/error scalars on
 * success/error/cancel — this only handles the outcome shape it *can't*
 * know about (the file/paste duplicate-fingerprint warning, Feature
 * 07.7.6). `errorMessage` carries the matched source's raw name, not a
 * formatted sentence — the UI template interpolates it into
 * `strings.import.errors.duplicateTemplate`.
 */
function reportNonSummaryOutcome(outcome: { ok: boolean; duplicate?: { id: string; name: string } }): void {
    if (!outcome.ok && outcome.duplicate) {
        setImportError('duplicate', outcome.duplicate.name);
    }
}
