import { appState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateM3uFixture } from '../../scripts/gen-m3u-fixture.mjs';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { IMPORT_STATE } from '../state/import';
import { get } from '../state/typed';
import { clearRows } from './channel-memory';
import { assertGroupCountsConsistent, cancelImport, isImportInFlight, runImport } from './import-run';
import { settleWorkerModuleCache } from '../shared/testing/worker-settle';

const SAMPLE = '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n';

/**
 * `runImport`'s single-flight guard is module state (`import-run.ts`'s
 * `active`), so a test whose import never settles leaves it set and every
 * *later* test in this file then fails with "already in flight" — one race
 * turning into a five-failure cascade. `cancelImport()` resolves
 * `runImport`'s cancel race regardless of whether its parse ever finishes,
 * so draining on it clears the guard deterministically instead of hoping a
 * fixed sleep was long enough.
 */
async function drainImport(): Promise<void> {
    cancelImport();
    for (let i = 0; i < 500 && isImportInFlight(); i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

describe('runImport() (Feature 07.9/07.7)', () => {
    afterEach(async () => {
        await drainImport();
        clearRows();
        resetPlatformForTests();
    });

    it('parses and commits a fresh m3u-text import', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const outcome = await runImport({ type: 'm3u-text', text: SAMPLE, name: 'Pasted playlist' });
            expect(outcome.ok).toBe(true);
            if (outcome.ok) {
                expect(outcome.summary.total).toBe(1);
                expect(outcome.summary.updated).toBe(false);
            }
            expect(await storage.count('playlists')).toBe(1);
            expect(isImportInFlight()).toBe(false);
        });
    });

    it('rejects a concurrent runImport() call while one is in flight (Feature 07.7.8)', async () => {
        await withFakePlatform({}, async () => {
            const first = runImport({ type: 'm3u-text', text: SAMPLE, name: 'A' });
            await expect(runImport({ type: 'm3u-text', text: SAMPLE, name: 'B' })).rejects.toThrow(/already in flight/);
            await first;
        });
    });

    it('cancelImport() mid-flight resolves cancelled and leaves zero trace (Feature 07.9.1/07.9.5)', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const promise = runImport({ type: 'm3u-text', text: SAMPLE, name: 'A' });
            cancelImport();
            const outcome = await promise;

            expect(outcome).toEqual({ ok: false, cancelled: true });
            expect(await storage.count('playlists')).toBe(0);
            expect(await storage.count('channels')).toBe(0);
            expect(await storage.count('groups')).toBe(0);
            expect(isImportInFlight()).toBe(false);
            // Feature 07.9.5: the card returns to idle, not stuck on
            // whatever stage it was cancelled from.
            tick();
            expect(get<string>(IMPORT_STATE)).toBe('idle');
        });
    });

    it('cancelImport() allows a fresh runImport() to proceed shortly afterward', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const stalled = runImport({ type: 'm3u-text', text: SAMPLE, name: 'A' });
            cancelImport();
            await stalled;

            // @vitest/web-worker backs every `new Worker()` for the same
            // module URL with a shared, invalidate-after-import module
            // cache (a real browser gives each worker a fully separate
            // module graph) — creating the second ParserClient's worker
            // immediately after cancel()'s replacement worker races two
            // concurrent imports of one cache slot. Same test-harness-only
            // finding as Phase 06's parser-client.spec.ts cancel() test;
            // this delay works around the harness, not a production race.
            await settleWorkerModuleCache();

            const outcome = await runImport({ type: 'm3u-text', text: SAMPLE, name: 'B' });
            expect(outcome.ok).toBe(true);
            expect(await storage.count('playlists')).toBe(1);
        });
    });

    it('a header-less parse failure rejects cleanly and leaves zero trace', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const outcome = await runImport({ type: 'm3u-text', text: 'not a playlist', name: 'Bad' });
            expect(outcome.ok).toBe(false);
            if (!outcome.ok && !outcome.cancelled) {
                expect(outcome.errorKind).toBe('m3u');
                expect(outcome.errorMessage).toContain('EXTM3U');
            }
            expect(await storage.count('playlists')).toBe(0);
            expect(await storage.count('channels')).toBe(0);
        });
    });

    it('upserts an existing m3u-url source instead of creating a second one', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const existing = makePlaylistRecord({ id: 'old', url: 'https://example.com/list.m3u', name: 'Original name' });
            await storage.bulkPut('playlists', [existing], (r) => r.id);

            const outcome = await runImport({
                type: 'm3u-url',
                text: SAMPLE,
                url: 'https://example.com/list.m3u',
                name: 'Ignored — existing name wins',
            });

            expect(outcome.ok).toBe(true);
            if (outcome.ok) {
                expect(outcome.summary.total).toBe(1);
                expect(outcome.summary.updated).toBe(true);
            }
            const playlists = await storage.getAll('playlists');
            expect(playlists).toHaveLength(1);
            expect(playlists[0]?.name).toBe('Original name');
            expect(playlists[0]?.id).not.toBe('old');
        });
    });

    it('never records an array of channel rows in Spektrum state during a real import (Feature 07.5.8/§5.8)', async () => {
        await withFakePlatform({}, async () => {
            const fixture = generateM3uFixture({ count: 2000, seed: 7 });
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const outcome = await runImport({ type: 'm3u-text', text: fixture.text, name: 'Big list' });
            tick();

            expect(outcome.ok).toBe(true);
            // assertCompact() (state/bulk-policy.ts) warns the moment any
            // setValue() payload is an over-limit array — silence here is
            // the actual proof, not just an absence-of-array spot check.
            expect(warnSpy).not.toHaveBeenCalled();
            expect(Array.isArray((appState['import'] as { summary?: unknown } | undefined)?.summary)).toBe(false);
            warnSpy.mockRestore();
        });
    });

    it('cancelling mid-parse on a larger fixture leaves zero staged rows and a clean immediate retry (Feature 07.9.9)', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const fixture = generateM3uFixture({ count: 20_000, seed: 11 });

            const stalled = runImport({ type: 'm3u-text', text: fixture.text, name: 'Big list' });
            cancelImport();
            const cancelledOutcome = await stalled;

            expect(cancelledOutcome).toEqual({ ok: false, cancelled: true });
            expect(await storage.count('playlists')).toBe(0);
            expect(await storage.count('channels')).toBe(0);
            expect(await storage.count('groups')).toBe(0);

            // Same @vitest/web-worker shared-module-cache workaround as the
            // smaller cancel test above — a longer margin here since this
            // test runs later in a full suite pass, where cross-file worker
            // contention (other *.spec.ts files' own real Worker instances,
            // all sharing @vitest/web-worker's one module cache) makes the
            // race window measurably less forgiving than in isolation.
            await settleWorkerModuleCache();

            const outcome = await runImport({ type: 'm3u-text', text: fixture.text, name: 'Big list' });
            expect(outcome.ok).toBe(true);
            if (outcome.ok) expect(outcome.summary.total).toBe(20_000);
            expect(await storage.count('playlists')).toBe(1);
        });
    });
});

describe('assertGroupCountsConsistent() (Feature 07.6.7)', () => {
    it('stays silent when group counts sum to the total', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        assertGroupCountsConsistent({
            total: 10,
            groups: [
                { name: 'News', count: 6, firstIndex: 0 },
                { name: 'Ungrouped', count: 4, firstIndex: 6 },
            ],
            radioCount: 0,
            drmCount: 0,
            skipped: 0,
            detectedEpgUrls: [],
        });
        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('warns when group counts drift from the total', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        assertGroupCountsConsistent({
            total: 10,
            groups: [{ name: 'News', count: 6, firstIndex: 0 }],
            radioCount: 0,
            drmCount: 0,
            skipped: 0,
            detectedEpgUrls: [],
        });
        expect(warnSpy).toHaveBeenCalledOnce();
        warnSpy.mockRestore();
    });
});
