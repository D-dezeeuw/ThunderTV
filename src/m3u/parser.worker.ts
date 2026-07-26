import { mapItemToChannelRow } from './channel-mapper';
import { extractM3uEpgUrls } from './epg-urls.util';
import { extractGroups } from './group-extractor';
import { parseM3u } from './parse-m3u';
import { CHUNK, type WorkerIn, type WorkerOut } from './worker-protocol';
import type { ChannelRow } from './types';

/**
 * The parser worker entry (Feature 06.3.1) — instantiated by
 * `parser-client.ts` via `new Worker(new URL('./parser.worker.ts',
 * import.meta.url), { type: 'module' })` so Vite bundles it as a proper
 * module-worker chunk. Kept Spektrum- and DOM-free (Feature 06.3.5,
 * enforced by the `src/m3u/parser.worker.ts` exemption's absence from any
 * `src/state/`/`src/ui/` import path) and thin (Feature 06.3.6) — real work
 * delegates to `parse-m3u.ts`, `channel-mapper.ts`, and `group-extractor.ts`.
 */
function post(message: WorkerOut): void {
    postMessage(message);
}

function handleParse(input: WorkerIn & { type: 'parse' }): void {
    const parsed = parseM3u(input.text);
    if (!parsed.ok) {
        post({ type: 'error', message: 'Playlist has no #EXTM3U header — nothing to import.' });
        return;
    }

    const items = parsed.playlist.items;
    const allRows: ChannelRow[] = [];
    let skipped = 0;
    let radioCount = 0;
    let drmCount = 0;
    // An empty playlist still gets exactly one (empty, done) chunk — the
    // client always sees at least one chunk message per parse, never zero.
    const chunkCount = Math.max(1, Math.ceil(items.length / CHUNK));

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const start = chunkIndex * CHUNK;
        const slice = items.slice(start, start + CHUNK);
        const mapped: ChannelRow[] = [];

        for (const item of slice) {
            const row = mapItemToChannelRow(item);
            if (!row) {
                skipped += 1;
                continue;
            }
            if (row.radio) radioCount += 1;
            if (row.drm) drmCount += 1;
            mapped.push(row);
            allRows.push(row);
        }

        const processed = Math.min(start + CHUNK, items.length);
        const done = chunkIndex === chunkCount - 1;
        post({ type: 'progress', parsed: processed });
        post({ type: 'chunk', rows: mapped, done });
    }

    post({
        type: 'summary',
        total: allRows.length,
        groups: extractGroups(allRows),
        radioCount,
        drmCount,
        skipped,
        detectedEpgUrls: extractM3uEpgUrls(parsed.playlist.header),
    });
}

self.onmessage = (event: MessageEvent<WorkerIn>) => {
    try {
        switch (event.data.type) {
            case 'parse':
                handleParse(event.data);
                return;
            default: {
                const exhaustive: never = event.data.type;
                throw new Error(`parser.worker: unknown message type "${String(exhaustive)}"`);
            }
        }
    } catch (err) {
        post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
};

// Feature 06.3.2: a self.onerror trap alongside the try/catch above — an
// uncaught synchronous error anywhere in the worker's own script (not just
// inside the onmessage handler) still answers with a protocol message
// instead of leaving the client hanging on a dead worker.
self.onerror = (event, _source, _lineno, _colno, error) => {
    const message = error?.message ?? (typeof event === 'string' ? event : 'Unknown worker error');
    post({ type: 'error', message });
    return true;
};

