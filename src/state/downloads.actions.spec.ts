import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import {
    cancelDownload,
    clearFinishedDownloads,
    dismissDownload,
    resetDownloadsForTests,
    startVodDownload,
} from './downloads.actions';
import {
    DOWNLOADS_ACTIVE_ID,
    DOWNLOADS_ITEMS,
    initDownloadsState,
    type DownloadEntry,
} from './downloads';
import { resetPersistForTests } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';
import { initVodState } from './vod';
import { resetVodMemoryForTests } from './vod-rows';
import { openVodCatalog } from './vod.actions';

/**
 * The queue's contract, in the terms the UI depends on: one transfer at a
 * time, a stable entry per movie, and exactly one terminal outcome per
 * transfer — a queue that fails to advance is indistinguishable on screen
 * from one that is merely slow, which is why every path through
 * `settleActive()` is covered here.
 */

const source = { url: 'http://example.com', user: 'bob', pass: 'secret' };

async function seedCatalog(http: FakeHttpAdapter, storage: MemoryStorage): Promise<void> {
    await storage.bulkPut(
        'playlists',
        [makePlaylistRecord({ id: 'src-1', type: 'xtream', url: source.url, username: source.user, password: source.pass })],
        (r) => r.id,
    );
    setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
    tick();

    http.onGet(apiUrl(source, 'get_vod_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([{ category_id: '1', category_name: 'ACTION' }]),
    });
    http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=1')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { stream_id: 10, name: 'Movie A', category_id: '1', container_extension: 'mkv' },
            { stream_id: 11, name: 'Movie B', category_id: '1', container_extension: 'mp4' },
        ]),
    });
    await openVodCatalog();
    tick();
}

function items(): DownloadEntry[] {
    return get<DownloadEntry[]>(DOWNLOADS_ITEMS) ?? [];
}

function entry(id: string): DownloadEntry | undefined {
    return items().find((candidate) => candidate.id === id);
}

afterEach(() => {
    resetDownloadsForTests();
    resetVodMemoryForTests();
    resetPersistForTests();
    resetState();
});

describe('downloads queue', () => {
    it('queues a movie under a stable id and starts it with the proxied stream URL', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);

            await startVodDownload(10);
            tick();

            expect(downloads.prepared).toEqual(['Movie A.mkv']);
            expect(downloads.started).toHaveLength(1);
            expect(downloads.started[0]?.url).toContain('/movie/bob/secret/10.mkv');
            expect(entry('vod:10')?.status).toBe('downloading');
            expect(get<string | null>(DOWNLOADS_ACTIVE_ID)).toBe('vod:10');
        });
    });

    it('queues nothing when the viewer dismisses the save picker', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);
            downloads.declineNextPrepare();

            await startVodDownload(10);
            tick();

            expect(items()).toEqual([]);
            expect(downloads.started).toHaveLength(0);
        });
    });

    it('publishes rounded progress and a formatted size, and lands on 100% when done', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);
            await startVodDownload(10);
            tick();

            downloads.emitProgress(512 * 1024 * 1024, 1024 * 1024 * 1024);
            tick();
            expect(entry('vod:10')?.percent).toBe(50);
            expect(entry('vod:10')?.sizeLabel).toBe('512 MB / 1 GB');

            downloads.finish();
            tick();
            expect(entry('vod:10')?.status).toBe('done');
            expect(entry('vod:10')?.percent).toBe(100);
            expect(get<string | null>(DOWNLOADS_ACTIVE_ID)).toBeNull();
        });
    });

    it('reports an indeterminate percent when the provider sends no Content-Length', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);
            await startVodDownload(10);
            tick();

            downloads.emitProgress(1024, null);
            tick();

            expect(entry('vod:10')?.percent).toBe(-1);
            expect(entry('vod:10')?.sizeLabel).toBe('1 KB');
        });
    });

    it('runs one transfer at a time and starts the next when the first finishes', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);

            await startVodDownload(10);
            await startVodDownload(11);
            tick();

            expect(downloads.started).toHaveLength(1);
            expect(entry('vod:10')?.status).toBe('downloading');
            expect(entry('vod:11')?.status).toBe('queued');

            downloads.finish();
            tick();

            expect(downloads.started).toHaveLength(2);
            expect(entry('vod:11')?.status).toBe('downloading');
            expect(get<string | null>(DOWNLOADS_ACTIVE_ID)).toBe('vod:11');
        });
    });

    it('cancels the running transfer through the adapter and advances to the next', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);
            await startVodDownload(10);
            await startVodDownload(11);
            tick();

            cancelDownload('vod:10');
            tick();

            expect(downloads.cancelled).toEqual(['Movie A.mkv']);
            expect(entry('vod:10')?.status).toBe('error');
            expect(entry('vod:10')?.errorReason).toBe('cancelled');
            // The queue must not stall on a cancel — that is the whole point
            // of routing it through the adapter's terminal callback.
            expect(entry('vod:11')?.status).toBe('downloading');
        });
    });

    it('cancels a still-queued entry without touching the running one', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);
            await startVodDownload(10);
            await startVodDownload(11);
            tick();

            cancelDownload('vod:11');
            tick();

            expect(downloads.cancelled).toEqual([]);
            expect(entry('vod:11')?.errorReason).toBe('cancelled');
            expect(entry('vod:10')?.status).toBe('downloading');
            expect(get<string | null>(DOWNLOADS_ACTIVE_ID)).toBe('vod:10');
        });
    });

    it('surfaces a failure reason and still advances the queue', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);
            await startVodDownload(10);
            await startVodDownload(11);
            tick();

            downloads.fail('network');
            tick();

            expect(entry('vod:10')?.status).toBe('error');
            expect(entry('vod:10')?.errorReason).toBe('network');
            expect(entry('vod:11')?.status).toBe('downloading');
        });
    });

    it('does not queue the same movie twice while it is still busy', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);

            await startVodDownload(10);
            await startVodDownload(10);
            tick();

            expect(items()).toHaveLength(1);
            expect(downloads.prepared).toHaveLength(1);
        });
    });

    it('marks a browser handoff terminal immediately rather than blocking the queue behind it', async () => {
        await withFakePlatform({ downloads: 'handoff' }, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);
            // The handoff adapter answers `prepare()` with a handoff target,
            // which the fake mirrors by target kind rather than capability.
            downloads.prepareKind = 'handoff';

            await startVodDownload(10);
            await startVodDownload(11);
            tick();

            expect(entry('vod:10')?.status).toBe('handoff');
            expect(entry('vod:11')?.status).toBe('handoff');
            expect(get<string | null>(DOWNLOADS_ACTIVE_ID)).toBeNull();
        });
    });

    it('dismiss removes a finished row; clearFinished keeps the busy ones', async () => {
        await withFakePlatform({}, async ({ http, storage, downloads }) => {
            initVodState();
            initDownloadsState();
            await seedCatalog(http, storage);
            await startVodDownload(10);
            await startVodDownload(11);
            tick();

            downloads.finish();
            tick();
            expect(entry('vod:10')?.status).toBe('done');

            clearFinishedDownloads();
            tick();
            expect(items().map((item) => item.id)).toEqual(['vod:11']);

            // Dismissing a busy entry cancels it instead of abandoning a
            // transfer that is still running.
            dismissDownload('vod:11');
            tick();
            expect(entry('vod:11')?.errorReason).toBe('cancelled');
        });
    });
});
