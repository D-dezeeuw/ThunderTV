import { afterEach, describe, expect, it } from 'vitest';
import { generateM3uFixture } from '../../scripts/gen-m3u-fixture.mjs';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { clearRows } from './channel-memory';
import { ParserClient } from './parser-client';

/**
 * Always-on perf guard (Feature 06.10.10) — parses a 10 k-row fixture under
 * a generous ceiling so a CI-less local `npm test` still catches an
 * order-of-magnitude regression (an accidental O(n²) loop, a chunk that
 * silently stopped chunking) without the tight-bound flakiness a real
 * budget assertion would have on shared/loaded machines. The hard <5s/100k
 * budget lives in the separate `npm run bench:m3u` harness
 * (`src/m3u/parser.bench.ts`) — this spec exists purely to run on every
 * `npm test`, not to pin the real number.
 */
describe('M3U parser perf smoke (Feature 06.10.10)', () => {
    afterEach(() => {
        clearRows();
        resetPlatformForTests();
    });

    it('parses a 10k-row fixture in well under a generous 2s ceiling', async () => {
        await withFakePlatform({}, async () => {
            const fixture = generateM3uFixture({ count: 10_000, seed: 42 });
            const client = new ParserClient();

            const start = performance.now();
            const summary = await client.parse(fixture.text, 'perf-smoke-10k');
            const elapsedMs = performance.now() - start;

            expect(summary.total).toBe(10_000);
            expect(elapsedMs).toBeLessThan(2_000);
        });
    });
});
