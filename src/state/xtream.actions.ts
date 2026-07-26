import { defineFn, refs } from 'spektrum';
import { importXtreamSource } from '../xtream/import';
import { normalizeXtreamUrl } from '../xtream/urls';
import { setImportError, setImportSourceName, setImportStage, setImportSummary } from './import-setters';
import { setActiveSourceId } from './playlist.actions';
import { isImportInFlight } from '../m3u/import';

/**
 * The Xtream Codes MVP import trigger — mirrors `import-triggers.ts`'s
 * shape (stage tracking, `reportOutcome`-style success routing) so the
 * existing `import-progress`/`import-error`/`import-summary` DOM surfaces
 * (Feature 07.5/07.6) work for Xtream without any new markup beyond the
 * login form itself. Guarded by the same `isImportInFlight()` the M3U
 * pipeline uses — Xtream and M3U imports never run concurrently.
 */
export function registerXtreamActions(): void {
    defineFn('xtream/import', () => {
        void triggerXtreamImport({
            url: refValue('xtreamUrlInput'),
            user: refValue('xtreamUserInput'),
            pass: refValue('xtreamPassInput'),
        });
    });
}

export async function triggerXtreamImport(params: { url: string; user: string; pass: string }): Promise<void> {
    if (isImportInFlight()) return;
    const url = normalizeXtreamUrl(params.url);
    if (!url || !params.user.trim() || !params.pass.trim()) return;

    setImportSourceName(url);
    setImportStage('fetching');

    const outcome = await importXtreamSource({ url, user: params.user.trim(), pass: params.pass, name: url });
    if (outcome.ok) {
        setImportSummary({
            sourceId: outcome.summary.sourceId,
            total: outcome.summary.total,
            groupCount: outcome.summary.groupCount,
            radioCount: 0,
            drmCount: 0,
            skipped: outcome.summary.skipped,
            detectedEpgUrlCount: 0,
            updated: outcome.summary.updated,
        });
        // Feature 07.6.5's pattern: pre-select the source so dismissing the
        // summary card drops straight into its (already-loaded) channel list.
        setActiveSourceId(outcome.summary.sourceId);
        return;
    }
    setImportError(toImportErrorKind(outcome.error.kind));
}

function refValue(name: string): string {
    const el = refs[name];
    return el instanceof HTMLInputElement ? el.value : '';
}

/** Reuses the existing `strings.http.failure` keys (Feature 07.4.2's taxonomy) rather than inventing an Xtream-specific error surface for the MVP slice — close enough copy, zero new strings/selector branches needed. */
function toImportErrorKind(kind: string): string {
    switch (kind) {
        case 'auth-failed':
            return 'httpAuth';
        case 'cors-or-network':
            return 'corsOrNetwork';
        case 'timeout':
            return 'timeout';
        default:
            return 'httpOther';
    }
}
