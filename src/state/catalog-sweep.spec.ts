import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorage, withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import type { ChannelRow } from '../m3u/types';
import { getAllRows } from '../ui/virtual-list';
import { apiUrl } from '../xtream/urls';
import type { XtreamSource } from '../xtream/types';
import { makeSourceKey } from '../core/connect/source-key';
import { cancelSweep, foreignVodItem, resetSweepForTests, sweptVodItems } from './catalog-sweep';
import { resetPersistForTests } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { initSearchState, SEARCH_SWEEP_OPEN, SEARCH_SWEEP_PROGRESS, SEARCH_SWEEP_STATUS } from './search';
import { resetSearchActionsForTests, setSearchQuery, setSearchScope } from './search.actions';
import { resetSearchSweepActionsForTests, startSweep, toggleSearchAll } from './search-sweep.actions';
import type { SweepProgress } from './sweep-plan';
import { get } from './typed';
import { initVodState } from './vod';
import { resetVodMemoryForTests } from './vod-rows';

/**
 * The sweep engine end to end, against two scripted providers: what it
 * fetches, what it keeps when one of them fails or the user cancels, and
 * that a swept result from the *other* provider stays playable and ranked
 * by the same search it always was.
 */

const one: XtreamSource = { url: 'http://one.example', user: 'alice', pass: 's1' };
const two: XtreamSource = { url: 'http://two.example', user: 'bob', pass: 's2' };
/** `sweepPrefix()`'s namespace for the non-active provider — derived, not spelled out, since `makeSourceKey()` normalizes the URL. */
const twoPrefix = `vod@${String(makeSourceKey('xtream', two.url, two.user))}`;

function seedVod(http: FakeHttpAdapter, source: XtreamSource, streams: Record<string, unknown>[]): void {
    http.onGet(apiUrl(source, 'get_vod_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([{ category_id: '1', category_name: 'Action' }]),
    });
    http.onGet(apiUrl(source, 'get_vod_streams')).reply({ kind: 'ok', body: JSON.stringify(streams) });
}

function movie(streamId: number, name: string): Record<string, unknown> {
    return { stream_id: streamId, name, category_id: '1', container_extension: 'mp4' };
}

async function seedBothSources(storage: MemoryStorage): Promise<void> {
    await storage.bulkPut(
        'playlists',
        [
            makePlaylistRecord({ id: 'src-1', name: 'One TV', type: 'xtream', url: one.url, username: one.user, password: one.pass }),
            makePlaylistRecord({ id: 'src-2', name: 'Two TV', type: 'xtream', url: two.url, username: two.user, password: two.pass }),
        ],
        (r) => r.id,
    );
    setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
    tick();
}

/** Yields to the microtask/timer queues until `predicate` holds, so a spec can act mid-sweep. */
async function waitFor(predicate: () => boolean, attempts = 200): Promise<void> {
    for (let i = 0; i < attempts; i++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('waitFor: condition never held');
}

function progress(): SweepProgress | undefined {
    return get<SweepProgress>(SEARCH_SWEEP_PROGRESS);
}

function rows(): readonly ChannelRow[] {
    return getAllRows();
}

describe('catalog sweep ("search all")', () => {
    afterEach(() => {
        resetSweepForTests();
        resetVodMemoryForTests();
        resetSearchActionsForTests();
        resetSearchSweepActionsForTests();
        resetPersistForTests();
        resetState();
    });

    it('warns before fetching anything when a provider cache is cold', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            initSearchState();
            await seedBothSources(storage);

            await toggleSearchAll();
            tick();

            expect(get<boolean>(SEARCH_SWEEP_OPEN)).toBe(true);
            expect(get<string>(SEARCH_SWEEP_STATUS)).toBe('confirm');
            expect(progress()?.sourcesTotal).toBe(2);
            expect(http.calls).toHaveLength(0); // nothing fetched until Start
        });
    });

    it('sweeps every provider, pools their catalogs, and reports complete coverage', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            initSearchState();
            await seedBothSources(storage);
            seedVod(http, one, [movie(1, 'The Matrix'), movie(2, 'Heat')]);
            seedVod(http, two, [movie(3, 'Matrix Reloaded')]);

            await startSweep();
            tick();

            expect(get<string>(SEARCH_SWEEP_STATUS)).toBe('done');
            expect(progress()).toMatchObject({
                sourcesTotal: 2,
                sourcesDone: 2,
                sourcesFailed: 0,
                items: 3,
                percent: 100,
                partial: false,
            });
            expect(sweptVodItems()).toHaveLength(3);
            // The active source's half lands under the plain prefix, i.e. it
            // IS the existing warm cache rather than a second copy of it.
            expect(await storage.get('vod.catalog.items.1')).toBeTruthy();
            expect(await storage.get(`${twoPrefix}.catalog.items.1`)).toBeTruthy();
        });
    });

    it('keeps going when one provider fails, and says the coverage is partial', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            initSearchState();
            await seedBothSources(storage);
            seedVod(http, one, [movie(1, 'The Matrix')]);
            http.onGet(apiUrl(two, 'get_vod_categories')).reply({ kind: 'http', status: 502 });

            await startSweep();
            tick();

            expect(get<string>(SEARCH_SWEEP_STATUS)).toBe('done');
            expect(progress()).toMatchObject({ sourcesDone: 2, sourcesFailed: 1, items: 1, partial: true });
            expect(sweptVodItems()).toHaveLength(1); // the reachable provider still counts
        });
    });

    it('cancels mid-sweep, keeping whatever already landed and never touching the rest', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            initSearchState();
            await seedBothSources(storage);
            seedVod(http, one, [movie(1, 'The Matrix'), movie(2, 'Heat')]);
            http.onGet(apiUrl(two, 'get_vod_categories')).reply({ kind: 'pending' });

            const running = startSweep();
            await waitFor(() => http.calls.length >= 2); // the first provider is in
            cancelSweep('vod');
            await running;
            tick();

            expect(get<string>(SEARCH_SWEEP_STATUS)).toBe('cancelled');
            expect(progress()?.partial).toBe(true);
            expect(sweptVodItems()).toHaveLength(2);
            expect(http.calls.filter((c) => c.url.includes('two.example'))).toHaveLength(0);
        });
    });

    it('needs no confirmation and no network once every provider is inside the TTL', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            initSearchState();
            await seedBothSources(storage);
            seedVod(http, one, [movie(1, 'The Matrix')]);
            seedVod(http, two, [movie(3, 'Matrix Reloaded')]);

            await startSweep();
            tick();
            const fetched = http.calls.length;

            await toggleSearchAll(); // off
            await toggleSearchAll(); // on again — warm, so straight through
            tick();

            expect(get<boolean>(SEARCH_SWEEP_OPEN)).toBe(false);
            expect(get<string>(SEARCH_SWEEP_STATUS)).toBe('done');
            expect(http.calls).toHaveLength(fetched);
        });
    });

    it('ranks the pooled catalogs with the ordinary search, labels rows by provider, and keeps foreign results playable', async () => {
        await withFakePlatform({ durableStorage: 'full' }, async ({ http, storage }) => {
            initVodState();
            initSearchState();
            await seedBothSources(storage);
            seedVod(http, one, [movie(1, 'Matrix Revolutions'), movie(2, 'Heat')]);
            seedVod(http, two, [movie(3, 'Matrix')]);

            await startSweep();
            setSearchScope('movies');
            setSearchQuery('matrix');
            tick();

            // Same rankSearch() tiers as a single-provider search: the exact
            // title outranks the longer one, whichever provider it came from.
            expect(rows().map((row) => row.name)).toEqual(['Matrix', 'Matrix Revolutions']);
            expect(rows()[0]?.group).toBe('Two TV · Action');
            expect(rows()[1]?.group).toBe('One TV · Action');
            // The foreign row's stream URL is built from ITS provider's
            // credentials, not the active account's.
            expect(rows()[0]?.url).toContain('http://two.example');
            expect(rows()[0]?.url).toContain('/bob/s2/');

            // ...and the detail/play path resolves the same owner.
            expect(foreignVodItem(3)?.account.sourceId).toBe('src-2');
            expect(foreignVodItem(3)?.prefix).toBe(twoPrefix);
            expect(foreignVodItem(1)).toBeNull(); // the active source is never "foreign"
        });
    });
});
