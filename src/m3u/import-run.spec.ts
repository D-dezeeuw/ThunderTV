import { afterEach, describe, expect, it } from 'vitest';
import { resetPlatformForTests } from '../core/platform';
import { withFakePlatform } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { clearRows } from './channel-memory';
import { cancelImport, isImportInFlight, runImport } from './import-run';

const SAMPLE = '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n';

describe('runImport() (Feature 07.9/07.7)', () => {
    afterEach(() => {
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
            await new Promise((resolve) => setTimeout(resolve, 10));

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
});
