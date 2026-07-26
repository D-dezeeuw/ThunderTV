import type { PlaylistRecord, PlaylistType } from '../core/storage';
import {
    resetImportState,
    setImportError,
    setImportProgress,
    setImportStage,
    setImportSummary,
    setImportWritten,
} from '../state/import-setters';
import type { ImportSummaryView } from '../state/import';
import { loadPlaylistSources } from '../state/playlist-load';
import { cleanupStaging, commitImport, findExistingByKey, sourceKeyFor } from './import-commit';
import { ParserClient, type ParseSummary } from './parser-client';

export interface RunImportParams {
    type: PlaylistType;
    text: string;
    url?: string;
    name: string;
    etag?: string | null;
    lastModified?: string | null;
    contentFingerprint?: string | null;
}

/**
 * Every kind but `'m3u'` names a `strings.http.failure`/`strings.import.errors`
 * key directly (Feature 07.4.2/07.4.3) — `src/m3u/import.ts` (the only
 * producer of those kinds) and the UI both resolve display copy from
 * `strings.ts`, never from a hardcoded message in this pipeline. `'m3u'` is
 * the one dynamic exception: the parser/worker's own error text (e.g.
 * which header was missing) can't be pre-authored, so it travels as
 * `errorMessage` instead.
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
    | 'm3u'
    /** Synthesized by `src/state/playlist.actions.ts` from a Feature 07.7.6 fingerprint match — `errorMessage` carries the matched source's name, not a full sentence, so `strings.import.errors.duplicateTemplate` can interpolate it. */
    | 'duplicate';

export type ImportOutcome =
    | { ok: true; summary: ImportSummaryView }
    | { ok: false; cancelled: true }
    | { ok: false; cancelled: false; errorKind: ImportErrorKind; errorMessage?: string };

interface ActiveImport {
    client: ParserClient;
    requestCancel: () => void;
}

let active: ActiveImport | null = null;

/** Feature 07.7.8: a concurrent import attempt is rejected, not queued — matches `ParserClient`'s own single-flight rule one layer up. */
export function isImportInFlight(): boolean {
    return active !== null;
}

/**
 * Feature 07.9.1/07.9.2: terminates the worker immediately (no cooperative
 * message round-trip) and resolves the pending `runImport()` call via the
 * race below — instantaneous from the user's perspective, and
 * `ParserClient.cancel()` already re-instantiates a fresh worker
 * internally, so nothing here needs to.
 */
export function cancelImport(): void {
    active?.requestCancel();
}

/**
 * The shared runner behind `importPlaylistFile`/`Text`/`Url` (Feature
 * 07.1.9/07.3.8). Every chunk lands directly under a fresh `stagingId` —
 * there is no separate "staging area" to move rows out of (Feature
 * 07.9.3): cancelling or erroring simply never writes a `PlaylistRecord`
 * pointing at it and deletes the orphaned rows; succeeding commits one
 * pointing at it via `commitImport`'s write-then-swap (Feature 07.7.4).
 */
export async function runImport(params: RunImportParams): Promise<ImportOutcome> {
    if (active) {
        throw new Error('runImport(): an import is already in flight — call cancelImport() first.');
    }

    const stagingId = crypto.randomUUID();
    const client = new ParserClient();
    let requestCancel!: () => void;
    const cancelSignal = new Promise<'cancelled'>((resolve) => {
        requestCancel = () => resolve('cancelled');
    });
    active = { client, requestCancel };

    setImportStage('parsing');
    setImportProgress(0);
    setImportWritten(0);

    try {
        const existing = await findExistingByKey(sourceKeyFor(params.type, params.url));

        let written = 0;
        const parsePromise = client
            .parse(params.text, stagingId, {
                onProgress: (parsed) => setImportProgress(parsed),
                onChunk: (rows) => {
                    written += rows.length;
                    setImportWritten(written);
                },
            })
            .then((summary) => ({ kind: 'summary' as const, summary }));

        const raced = await Promise.race([parsePromise, cancelSignal.then((kind) => ({ kind }))]);
        if (raced.kind === 'cancelled') {
            client.cancel();
            await cleanupStaging(stagingId);
            // Feature 07.9.5: cancel leaves the card exactly as it was
            // before the attempt — idle, zero staged trace.
            resetImportState();
            return { ok: false, cancelled: true };
        }

        assertGroupCountsConsistent(raced.summary);

        setImportStage('writing');
        const record = await commitImport(
            {
                stagingId,
                type: params.type,
                url: params.url,
                name: nameFor(params, existing),
                summary: raced.summary,
                etag: params.etag ?? null,
                lastModified: params.lastModified ?? null,
                contentFingerprint: params.contentFingerprint ?? null,
            },
            existing,
        );
        await loadPlaylistSources();

        const view = toSummaryView(record, raced.summary.detectedEpgUrls.length, existing !== undefined);
        setImportSummary(view);
        return { ok: true, summary: view };
    } catch (err) {
        await cleanupStaging(stagingId);
        const message = err instanceof Error ? err.message : String(err);
        setImportError('m3u', message);
        return { ok: false, cancelled: false, errorKind: 'm3u', errorMessage: message };
    } finally {
        active = null;
    }
}

/**
 * Feature 07.6.7: a dev-mode-only sanity check — every channel row belongs
 * to exactly one group (including the synthetic `Ungrouped` bucket), so the
 * counts must sum to the total. Never throws (matches `assertCompact`'s own
 * convention, `state/bulk-policy.ts`): a loud dev warning catches
 * mapper/group drift immediately without turning a display bug into a
 * failed import for a real user.
 */
export function assertGroupCountsConsistent(summary: ParseSummary): void {
    if (!import.meta.env.DEV) return;
    const groupSum = summary.groups.reduce((sum, g) => sum + g.count, 0);
    if (groupSum !== summary.total) {
        console.warn(
            `[ThunderTV] import: group counts (${String(groupSum)}) don't sum to the channel total (${String(summary.total)}) — mapper/group drift (Feature 07.6.7).`,
        );
    }
}

function nameFor(params: RunImportParams, existing: PlaylistRecord | undefined): string {
    return existing?.name ?? params.name;
}

function toSummaryView(record: PlaylistRecord, detectedEpgUrlCount: number, updated: boolean): ImportSummaryView {
    return {
        sourceId: record.id,
        total: record.channelCount,
        groupCount: record.groupCount,
        radioCount: record.radioCount,
        drmCount: record.drmCount,
        skipped: record.skipped,
        detectedEpgUrlCount,
        updated,
    };
}
