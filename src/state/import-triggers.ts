import { refs } from 'spektrum';
import { getPlatform } from '../core/platform';
import { M3U_ACCEPT } from '../core/platform/web-file-adapter';
import {
    cancelImport,
    importPlaylistFile,
    importPlaylistText,
    importPlaylistUrl,
    isImportInFlight,
    type ImportEntryOutcome,
} from '../m3u/import';
import { IMPORT_SOURCE_NAME } from './import';
import { resetImportState, setImportError, setImportSourceName, setImportStage } from './import-setters';
import { setActiveSourceId } from './playlist.actions';
import { clearXtreamRetry } from './xtream.actions';
import { get } from './typed';

/**
 * The actual async orchestration behind every import entry point (Feature
 * 07.1.9/07.3.8/07.9.1), split out from `playlist.actions.ts` (which stays
 * thin `defineFn` registration + DOM plumbing) to keep both files well
 * under the 300-line convention. Every entry here is single-flight-guarded
 * on top of `runImport()`'s own guard, so a rapid double-click or a drop
 * during an in-flight import never reaches the pipeline twice.
 */

/** Feature 07.7.6: the file/text payload behind the most recent duplicate-fingerprint warning — retried verbatim by `import/confirmDuplicate` ("import anyway"), cleared the moment any other outcome lands. */
type DuplicateCandidate = { kind: 'file'; file: File } | { kind: 'text'; text: string };
let lastDuplicateCandidate: DuplicateCandidate | null = null;

/**
 * Feature 07.9.1: cancellation during the "fetching" stage — the one stage
 * `runImport()`'s own `cancelImport()` can't reach, since a URL fetch
 * happens entirely *before* `runImport()` is ever called. Non-null only
 * while a URL fetch is actually in flight.
 */
let activeFetchController: AbortController | null = null;

/** Wired to the Cancel button/Escape for every stage (Feature 07.9.1/07.9.8) — aborts the fetch if one is in flight, otherwise defers to `runImport()`'s own cancel (parsing/writing). */
export function cancelCurrentImport(): void {
    if (activeFetchController) {
        activeFetchController.abort();
        return;
    }
    cancelImport();
}

export async function triggerFileImport(): Promise<void> {
    if (isImportInFlight()) return;
    const picked = await getPlatform().files.pickFile(M3U_ACCEPT);
    if (!picked) return;
    await runFileImport(picked.file);
}

/** Feature 07.2.7: the drag-and-drop entry — same pipeline, no picker round-trip. */
export async function triggerFileImportFromFile(file: File): Promise<void> {
    if (isImportInFlight()) return;
    await runFileImport(file);
}

async function runFileImport(file: File): Promise<void> {
    setImportSourceName(file.name);
    setImportStage('reading');
    focusImportProgress();
    lastDuplicateCandidate = { kind: 'file', file };
    reportOutcome(await importPlaylistFile(file));
}

export async function triggerUrlImport(url: string): Promise<void> {
    if (isImportInFlight() || !url.trim()) return;
    const trimmed = url.trim();
    setImportSourceName(trimmed);
    setImportStage('fetching');
    focusImportProgress();
    lastDuplicateCandidate = null;
    // The shared retry buttons now target this URL import, not a previously
    // failed Xtream attempt (see xtream.actions.ts's lastXtreamParams).
    clearXtreamRetry();

    const controller = new AbortController();
    activeFetchController = controller;
    try {
        reportOutcome(await importPlaylistUrl(trimmed, { signal: controller.signal }));
    } catch (err) {
        // An abort during the fetch rejects rather than resolving a
        // classified failure (classified-fetch.ts's own contract) — this is
        // the expected shape of "the user cancelled", not a real error.
        if (!controller.signal.aborted) throw err;
        resetImportState();
    } finally {
        activeFetchController = null;
    }
}

/** Feature 07.4.4/07.8.5: re-runs the exact same URL import — a configured proxy (if any) is picked up automatically by the http adapter, so "Retry" and "Retry via proxy" are the same call underneath. */
export async function retryLastUrlImport(): Promise<void> {
    const url = get<string | null>(IMPORT_SOURCE_NAME);
    if (!url) return;
    await triggerUrlImport(url);
}

/** `sizeConfirmed` bypasses the Feature 07.3.4 large-paste guard — set only by `import/confirmLargePaste`, which re-reads the live textarea rather than trusting a captured copy. */
export async function triggerTextImport(text: string, sizeConfirmed = false): Promise<void> {
    if (isImportInFlight() || !text.trim()) return;
    if (!sizeConfirmed && byteLength(text) > PASTE_CONFIRM_BYTES) {
        setImportError('largeConfirm');
        return;
    }
    setImportStage('parsing');
    focusImportProgress();
    lastDuplicateCandidate = { kind: 'text', text };
    reportOutcome(await importPlaylistText(text));
}

/** Feature 07.7.6: replays the last duplicate-flagged file/paste with `allowDuplicate: true`. */
export async function retryAllowingDuplicate(): Promise<void> {
    const pending = lastDuplicateCandidate;
    if (!pending || isImportInFlight()) return;
    if (pending.kind === 'file') {
        setImportSourceName(pending.file.name);
        setImportStage('reading');
        focusImportProgress();
        reportOutcome(await importPlaylistFile(pending.file, { allowDuplicate: true }));
    } else {
        setImportStage('parsing');
        focusImportProgress();
        reportOutcome(await importPlaylistText(pending.text, undefined, { allowDuplicate: true }));
    }
}

/**
 * Feature 07.9.8: focuses the progress surface once its `data-if` reveal
 * lands (Spektrum applies that on the next tick, same double-rAF need as
 * `ui.actions.ts`'s settings-panel open), so Escape can cancel without a
 * pointer. A no-op once bindDOM never populated the ref (e.g. `mountTemplate()`
 * test harnesses that don't render the real card).
 */
function focusImportProgress(): void {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            (refs['importProgress'] as HTMLElement | undefined)?.focus();
        });
    });
}

/** ~50 MB (Feature 07.3.4) — a soft guard, never a refusal; the worker can take it, this only sets expectations about parse time. */
const PASTE_CONFIRM_BYTES = 50 * 1024 * 1024;

function byteLength(text: string): number {
    return new TextEncoder().encode(text).length;
}

/**
 * `runImport()` only ever runs for the successful-parse path — every
 * classified pre-parse failure (mixed content, an HTTP/CORS/timeout
 * failure, a too-large file, a failed M3U sniff) is returned directly by
 * `src/m3u/import.ts`'s entry functions *without* ever reaching
 * `runImport()`, so nothing else sets `import.errorKind` for those; this is
 * the one place that does. The Feature 07.7.6 duplicate-fingerprint warning
 * is the one shape `runImport()` could never have produced itself (it's
 * synthesized here, before `runImport()` would even be called), and
 * `cancelled: true` is the one shape that needs no further action —
 * `runImport()`'s own cancel branch already reset state to idle (Feature
 * 07.9.5). Feature 07.3.6's "clear the textarea only after a successful
 * summary" also lives here, since the textarea is uncontrolled and nothing
 * else would clear it.
 */
function reportOutcome(outcome: ImportEntryOutcome): void {
    if (outcome.ok) {
        clearPasteTextarea();
        lastDuplicateCandidate = null;
        // Feature 07.6.5's deferred "Open channel list": a successful
        // import navigates straight into its channel list (Feature 08.10.6's
        // watch() on playlist.activeSourceId does the actual load) instead
        // of leaving the user on the sources list with no way in yet.
        setActiveSourceId(outcome.summary.sourceId);
        return;
    }
    lastDuplicateCandidate = null;
    if ('duplicate' in outcome) {
        setImportError('duplicate', outcome.duplicate.name);
        return;
    }
    if (outcome.cancelled) return;
    setImportError(outcome.errorKind, outcome.errorMessage ?? null);
}

export function clearPasteTextarea(): void {
    const el = refs['pasteTextarea'];
    if (el instanceof HTMLTextAreaElement) el.value = '';
}
