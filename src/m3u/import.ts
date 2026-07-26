import { mixedContentBlocked, type FetchFailure } from '../core/http/classified-fetch';
import { getPlatform } from '../core/platform';
import { findExistingByFingerprint } from './import-commit';
import { contentFingerprint, looksLikeM3u } from './import-sniff';
import { runImport, type ImportOutcome } from './import-run';
import { getFilenameFromUrl } from './playlist.utils';

export { cancelImport, isImportInFlight } from './import-run';
export type { ImportOutcome } from './import-run';

/**
 * Every non-`'m3u'` kind here names a `strings.http.failure`/
 * `strings.import.errors` key directly (Feature 07.4.2/07.4.3/07.3.2) — the
 * UI resolves the actual display copy from there, never from a string this
 * pipeline module hardcodes (the project's central-strings-module rule
 * applies to pipeline-produced user-facing text exactly as much as to
 * markup). `'m3u'` is the one dynamic exception: the parser/worker's own
 * message (e.g. which header was missing) can't be pre-authored.
 */
export type ImportErrorKind =
    | 'invalidM3u'
    | 'tooLarge'
    | 'mixedContent'
    | 'httpAuth'
    | 'httpNotFound'
    | 'httpServer'
    | 'httpOther'
    | 'timeout'
    | 'corsOrNetwork'
    | 'offline'
    | 'm3u';

export interface ImportEntryOptions {
    /** Bypasses the Feature 07.7.6 content-fingerprint warning — the user's explicit "import anyway" choice. */
    allowDuplicate?: boolean;
}

export type ImportEntryOutcome = ImportOutcome | { ok: false; duplicate: { id: string; name: string } };

function invalidM3uOutcome(): ImportEntryOutcome {
    return { ok: false, cancelled: false, errorKind: 'invalidM3u' };
}

/**
 * Shared entry for file and paste imports (Feature 07.3.8: "route paste
 * through the exact same pipeline function as file and URL, one pipeline,
 * three entrances"). `name` is the picked filename or "Pasted playlist"
 * (Feature 07.3.3); the fingerprint check only applies here — URL sources
 * key on `makeSourceKey` instead and never carry one.
 */
async function importPlaylistTextInternal(
    text: string,
    type: 'm3u-file' | 'm3u-text',
    name: string,
    options: ImportEntryOptions,
): Promise<ImportEntryOutcome> {
    if (!looksLikeM3u(text)) return invalidM3uOutcome();

    const fingerprint = contentFingerprint(text);
    if (!options.allowDuplicate) {
        const dup = await findExistingByFingerprint(fingerprint);
        if (dup) return { ok: false, duplicate: { id: dup.id, name: dup.name } };
    }

    return runImport({ type, text, name, contentFingerprint: fingerprint });
}

/** Feature 07.2: file upload — the always-working, CORS-free path. `file.text()` already decodes UTF-8 with the replacement (non-fatal) error mode per the File API spec, matching Feature 06.7.9's decoding boundary; the fork strips a leading BOM internally (Feature 06.7.3). */
export async function importPlaylistFile(file: File, options: ImportEntryOptions = {}): Promise<ImportEntryOutcome> {
    const result = await getPlatform().files.readText(file);
    if (result.kind === 'too-large') {
        return { ok: false, cancelled: false, errorKind: 'tooLarge' };
    }
    return importPlaylistTextInternal(result.text, 'm3u-file', file.name, options);
}

/** Feature 07.3: paste-as-text — same zero-infrastructure guarantee as file (no network involved). */
export async function importPlaylistText(
    text: string,
    name = 'Pasted playlist',
    options: ImportEntryOptions = {},
): Promise<ImportEntryOutcome> {
    return importPlaylistTextInternal(text, 'm3u-text', name, options);
}

export interface ImportUrlOptions {
    /** Feature 07.9.1: cancels the in-flight fetch — the one stage `runImport()`'s own cancel can't reach, since it hasn't been called yet during "fetching". An abort rejects rather than resolving a classified failure (see `classified-fetch.ts`'s own comment); the caller (`triggerUrlImport`) is expected to catch it. */
    signal?: AbortSignal;
}

/**
 * Feature 07.4: URL import through `classifiedFetch` (via the platform's
 * `HttpAdapter`, which already applies the configured proxy — Feature
 * 07.8.2). Every failure kind maps to its own `errorKind` so the UI can
 * choose both the right copy and the right retry affordance without
 * re-deriving either from a message string.
 */
export async function importPlaylistUrl(url: string, options: ImportUrlOptions = {}): Promise<ImportEntryOutcome> {
    if (mixedContentBlocked(url)) {
        return { ok: false, cancelled: false, errorKind: 'mixedContent' };
    }

    const result = await getPlatform().http.get(url, options.signal ? { signal: options.signal } : {});
    if (result.kind !== 'ok') {
        return { ok: false, cancelled: false, errorKind: classifyHttpFailure(result) };
    }

    const text = await result.res.text();
    if (!looksLikeM3u(text)) return invalidM3uOutcome();

    return runImport({
        type: 'm3u-url',
        text,
        url,
        name: getFilenameFromUrl(url),
        etag: result.etag,
        lastModified: result.lastModified,
    });
}

/** Feature 07.4.3/07.4.2: every classified failure kind maps to its own `strings.http.failure` key — never one generic "network error". */
function classifyHttpFailure(failure: FetchFailure): ImportErrorKind {
    switch (failure.kind) {
        case 'http':
            return httpStatusKind(failure.status);
        case 'timeout':
            return 'timeout';
        case 'mixed-content':
            return 'mixedContent';
        case 'too-large':
            return 'tooLarge';
        case 'cors-or-network':
            return failure.offlineHint ? 'offline' : 'corsOrNetwork';
    }
}

function httpStatusKind(status: number): ImportErrorKind {
    if (status === 401 || status === 403) return 'httpAuth';
    if (status === 404) return 'httpNotFound';
    if (status >= 500) return 'httpServer';
    return 'httpOther';
}
