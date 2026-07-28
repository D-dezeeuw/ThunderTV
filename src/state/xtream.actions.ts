import { defineFn, refs } from 'spektrum';
import { importXtreamSource } from '../xtream/import';
import { normalizeXtreamUrl } from '../xtream/urls';
import { setImportError, setImportSourceName, setImportStage, setImportSummary } from './import-setters';
import { loadPlaylistSources } from './playlist-load';
import { setActiveSourceId } from './playlist.actions';
import { isImportInFlight } from '../m3u/import';

/**
 * The Xtream Codes MVP import trigger — mirrors `import-triggers.ts`'s
 * shape (stage tracking, `reportOutcome`-style success routing) so the
 * existing `import-progress`/`import-error`/`import-summary` DOM surfaces
 * (Feature 07.5/07.6) work for Xtream without any new markup beyond the
 * login form itself. Guarded by the same `isImportInFlight()` the M3U
 * pipeline uses plus its own in-flight flag (the M3U guard only covers
 * `runImport()`, which Xtream never calls).
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

let xtreamInFlight = false;

/**
 * The shared retry buttons' payload: the last attempted Xtream credentials,
 * kept so `import/retry`/`import/retryViaProxy` (registered in
 * `playlist.actions.ts`, shared with the M3U URL path) can re-run the
 * *Xtream* import — without this they'd feed the Xtream server URL through
 * the M3U pipeline via `retryLastUrlImport()`. Cleared on success and
 * whenever an M3U URL import starts (`import-triggers.ts`), so whichever
 * pipeline failed most recently owns the retry.
 */
let lastXtreamParams: { url: string; user: string; pass: string } | null = null;

export function clearXtreamRetry(): void {
    lastXtreamParams = null;
}

/** Returns true when an Xtream retry was dispatched — the caller falls back to the M3U URL retry otherwise. */
export function retryLastXtreamImport(): boolean {
    if (!lastXtreamParams) return false;
    void triggerXtreamImport(lastXtreamParams);
    return true;
}

export async function triggerXtreamImport(params: { url: string; user: string; pass: string }): Promise<void> {
    if (isImportInFlight() || xtreamInFlight) return;
    const url = normalizeXtreamUrl(params.url);
    if (!url || !params.user.trim() || !params.pass.trim()) return;

    setImportSourceName(url);
    setImportStage('fetching');
    lastXtreamParams = { url, user: params.user.trim(), pass: params.pass };

    xtreamInFlight = true;
    try {
        const outcome = await importXtreamSource({ url, user: params.user.trim(), pass: params.pass, name: url });
        if (outcome.ok) {
            lastXtreamParams = null;
            await loadPlaylistSources();
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
    } finally {
        xtreamInFlight = false;
    }
}

function refValue(name: string): string {
    const el = refs[name];
    return el instanceof HTMLInputElement ? el.value : '';
}

/**
 * Maps the Xtream taxonomy onto `strings.http.failure` keys (Feature
 * 07.4.2's pattern). CORS and mixed-content get Xtream-specific copy — the
 * generic playlist strings suggest "download the file and upload it
 * instead", which is meaningless advice for credentials, and mixed content
 * (an http:// provider on the https-deployed page — the overwhelmingly
 * common Xtream setup) deserves its precise explanation, not a CORS story.
 */
/** Exported for reuse by `settings.actions.ts`'s Settings-panel Xtream account save. */
export function toImportErrorKind(kind: string): string {
    switch (kind) {
        case 'auth-failed':
            return 'httpAuth';
        case 'cors-or-network':
            return 'xtreamCorsOrNetwork';
        case 'mixed-content':
            return 'xtreamMixedContent';
        case 'timeout':
            return 'timeout';
        default:
            return 'httpOther';
    }
}
