import { afterEach, describe, expect, it } from 'vitest';
import { generateM3uFixture } from '../../scripts/gen-m3u-fixture.mjs';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { clearRows } from './channel-memory';
import { mapItemToChannelRow } from './channel-mapper';
import { parseM3u } from './parse-m3u';
import { ParserClient } from './parser-client';
import { CHUNK } from './worker-protocol';

/**
 * The heavy Feature 06.10 benchmark — deliberately named `.bench.ts` (not
 * `.spec.ts`) so `vitest.config.ts`'s `include: ['src/**\/*.spec.ts']` never
 * picks it up: `npm test` must stay fast, this file is multiple seconds by
 * design. Run on demand via `npm run bench:m3u`
 * (`vitest.bench.config.ts`, Feature 06.10.9).
 *
 * Every assertion here is a real gate (Feature 06.10.4) — a failed
 * `expect()` fails `vitest run`'s process, so a budget regression is a
 * nonzero exit code, not a number a human has to notice in a log.
 *
 * Not covered here (documented gap, Feature 06.10.5): main-thread
 * `PerformanceObserver('longtask')` health requires a real browser —
 * jsdom/Node have no longtask implementation. That was verified separately
 * via a one-off scripted Playwright/Chromium run against a standalone bench
 * page (`bench/index.html`); see the Phase 06 tracker's Feature 06.10
 * evidence for the captured numbers. Full automation of that browser pass
 * is Phase 27 Feature 27.6's job, once `@playwright/test` is a real project
 * dependency — adding it here would front-load that phase's scope.
 */
const BUDGET_100K_MS = 5_000;

describe('M3U parsing engine — 100k-channel benchmark (Feature 06.10)', () => {
    afterEach(() => {
        clearRows();
        resetPlatformForTests();
    });

    it('full worker round-trip on 10k and 100k fixtures — 100k must finish under the 5s budget', async () => {
        await withFakePlatform({}, async () => {
            for (const count of [10_000, 100_000]) {
                const fixture = generateM3uFixture({ count, seed: 42 });
                const client = new ParserClient();
                const chunkSizes: number[] = [];

                const start = performance.now();
                const summary = await client.parse(fixture.text, `bench-${String(count)}`, {
                    onChunk: (rows) => chunkSizes.push(rows.length),
                });
                const elapsedMs = performance.now() - start;

                expect(summary.total).toBe(count);
                expect(summary.radioCount).toBe(fixture.radioCount);
                expect(summary.drmCount).toBe(fixture.drmCount);

                const rowsPerSecond = Math.round((count / elapsedMs) * 1000);
                console.log(
                    `[bench:m3u] ${String(count)} rows: ${elapsedMs.toFixed(0)}ms round-trip, ${String(rowsPerSecond)} rows/s, ${String(chunkSizes.length)} chunk messages`,
                );

                if (count === 100_000) {
                    expect(elapsedMs).toBeLessThan(BUDGET_100K_MS);
                }

                // Feature 06.10.8: progress cadence — every chunk but the
                // last is exactly CHUNK rows, no burst saved for the end.
                expect(chunkSizes.slice(0, -1).every((n) => n === CHUNK)).toBe(true);
                expect(chunkSizes.at(-1)).toBeLessThanOrEqual(CHUNK);
            }
        });
    }, 30_000);

    /**
     * Mapping-only cost by candidate CHUNK size — informational, and
     * deliberately NOT the deciding measurement (see the decision note next
     * to `CHUNK` in `worker-protocol.ts`). This same-thread loop only times
     * `mapItemToChannelRow`; it omits the real per-chunk receiving-side
     * cost (message clone + `MemoryStorage.bulkPut`'s per-row
     * `structuredClone`) that only a genuine worker/main-thread boundary
     * pays for, which real-browser Playwright verification showed is what
     * actually decides the 50 ms budget. Kept here because the mapping
     * numbers are still a real, useful data point — just not sufficient on
     * their own.
     */
    it('compares CHUNK candidates 1000/5000/10000 on the 100k fixture (mapping-only cost — see decision note)', () => {
        const fixture = generateM3uFixture({ count: 100_000, seed: 42 });
        const parsed = parseM3u(fixture.text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const items = parsed.playlist.items;

        for (const candidate of [1_000, 5_000, 10_000]) {
            const start = performance.now();
            let messageCount = 0;
            let maxChunkMs = 0;
            for (let i = 0; i < items.length; i += candidate) {
                const chunkStart = performance.now();
                for (const item of items.slice(i, i + candidate)) mapItemToChannelRow(item);
                maxChunkMs = Math.max(maxChunkMs, performance.now() - chunkStart);
                messageCount += 1;
            }
            const totalMs = performance.now() - start;
            console.log(
                `[bench:m3u] CHUNK=${String(candidate)}: ${totalMs.toFixed(1)}ms total, ${String(messageCount)} messages, ${maxChunkMs.toFixed(2)}ms longest single chunk`,
            );
        }
    }, 30_000);

    it('records peak heap during the 100k parse where performance.memory is available (Feature 06.10.6)', async () => {
        await withFakePlatform({}, async () => {
            const memoryApi = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
            if (!memoryApi) {
                console.log(
                    '[bench:m3u] performance.memory is unavailable in this environment (jsdom/Node lack the Chrome-only extension) — see the Phase 06 tracker for the manual DevTools reading.',
                );
                return;
            }
            const before = memoryApi.usedJSHeapSize;
            const fixture = generateM3uFixture({ count: 100_000, seed: 42 });
            const client = new ParserClient();
            await client.parse(fixture.text, 'bench-heap');
            const after = memoryApi.usedJSHeapSize;
            console.log(`[bench:m3u] heap before=${String(before)} after=${String(after)} delta=${String(after - before)}`);
        });
    }, 30_000);
});
