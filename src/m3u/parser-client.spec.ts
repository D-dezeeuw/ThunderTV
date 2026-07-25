import { afterEach, describe, expect, it } from 'vitest';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { clearRows, getRows } from './channel-memory';
import { ParserClient } from './parser-client';
import { CHUNK } from './worker-protocol';

/**
 * Exercises the real `ParserClient` against the real `parser.worker.ts`
 * (via `@vitest/web-worker`, Feature 06.3.8) and a `FakePlatform` storage
 * backend — no hand-rolled worker stand-in.
 */
describe('ParserClient', () => {
    afterEach(() => {
        clearRows();
        resetPlatformForTests();
    });

    it('parses a small playlist, writes rows to storage, and populates channel-memory', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const client = new ParserClient();
            const progressCalls: number[] = [];
            const chunkCalls: { count: number; done: boolean }[] = [];

            const summary = await client.parse(
                '#EXTM3U\n#EXTINF:-1 group-title="News",One\nhttps://example.com/1.m3u8\n#EXTINF:-1,Two\nhttps://example.com/2.m3u8\n',
                'playlist-1',
                {
                    onProgress: (parsed) => progressCalls.push(parsed),
                    onChunk: (rows, done) => chunkCalls.push({ count: rows.length, done }),
                },
            );

            expect(summary.total).toBe(2);
            expect(summary.skipped).toBe(0);
            expect(progressCalls).toEqual([2]);
            expect(chunkCalls).toEqual([{ count: 2, done: true }]);

            const stored = await storage.getAll('channels');
            expect(stored).toHaveLength(2);
            expect(stored.map((r) => r.playlistId)).toEqual(['playlist-1', 'playlist-1']);
            expect(stored.map((r) => r.index).sort()).toEqual([0, 1]);

            expect(getRows()).toHaveLength(2);
            expect(getRows().map((r) => r.name)).toEqual(['One', 'Two']);
        });
    });

    it('writes each chunk with globally-increasing storage indices across multiple chunks', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const lines = ['#EXTM3U'];
            const rowCount = CHUNK + 3;
            for (let i = 0; i < rowCount; i += 1) {
                lines.push(
                    `#EXTINF:-1,Channel ${String(i)}`,
                    `https://example.com/${String(i)}.m3u8`,
                );
            }

            const client = new ParserClient();
            const summary = await client.parse(lines.join('\n'), 'playlist-big');

            expect(summary.total).toBe(rowCount);
            const stored = await storage.getAll('channels');
            expect(stored).toHaveLength(rowCount);
            const indices = stored.map((r) => r.index).sort((a, b) => a - b);
            expect(indices[0]).toBe(0);
            expect(indices[indices.length - 1]).toBe(rowCount - 1);
            // No duplicate/skipped index despite arriving across two chunk messages.
            expect(new Set(indices).size).toBe(rowCount);
        });
    });

    it('rejects a second parse() while one is in flight', async () => {
        await withFakePlatform({}, async () => {
            const client = new ParserClient();
            const first = client.parse(
                '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n',
                'p1',
            );
            await expect(
                client.parse('#EXTM3U\n#EXTINF:-1,Two\nhttps://example.com/2.m3u8\n', 'p2'),
            ).rejects.toThrow(/already in flight/);
            await first;
        });
    });

    it('allows a new parse after a prior one resolves', async () => {
        await withFakePlatform({}, async () => {
            const client = new ParserClient();
            await client.parse('#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n', 'p1');
            const second = await client.parse(
                '#EXTM3U\n#EXTINF:-1,Two\nhttps://example.com/2.m3u8\n',
                'p2',
            );
            expect(second.total).toBe(1);
        });
    });

    it('rejects with the worker error message for a header-less playlist', async () => {
        await withFakePlatform({}, async () => {
            const client = new ParserClient();
            await expect(client.parse('not a playlist', 'p1')).rejects.toThrow(/EXTM3U/);
        });
    });

    it('cancel() allows a fresh parse to proceed immediately, even mid-flight', async () => {
        await withFakePlatform({}, async () => {
            const client = new ParserClient();
            const stalled = client.parse(
                '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n',
                'p1',
            );
            stalled.catch(() => undefined);

            // Let the worker's own async module-instantiation settle before
            // tearing it down. @vitest/web-worker backs every `new Worker()`
            // for the same module URL with a shared, invalidate-after-import
            // module cache (real browsers instead give each worker a fully
            // separate global/module graph). Calling `cancel()` — which
            // synchronously spins up a second worker for the same module —
            // before the first worker's own import has invalidated that
            // cache entry races two concurrent imports of one cache slot,
            // and the loser never gets its `self.onmessage` wired up. A
            // real browser has no such shared cache, so this delay only
            // works around the test harness, not a production race.
            await new Promise((resolve) => setTimeout(resolve, 10));

            client.cancel();

            const summary = await client.parse(
                '#EXTM3U\n#EXTINF:-1,Two\nhttps://example.com/2.m3u8\n',
                'p2',
            );
            expect(summary.total).toBe(1);
        });
    });
});
