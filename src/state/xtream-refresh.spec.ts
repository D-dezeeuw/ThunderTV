import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import { resetPersistForTests } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';
import { refreshActiveXtreamSource, resetXtreamRefreshForTests, XTREAM_REFRESH_TTL_MS } from './xtream-refresh';

const source = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function scriptRefreshRoutes(http: FakeHttpAdapter): void {
    http.onGet(apiUrl(source, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    http.onGet(apiUrl(source, 'get_live_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([{ category_id: '1', category_name: 'NL' }]),
    });
    http.onGet(apiUrl(source, 'get_live_streams')).reply({
        kind: 'ok',
        body: JSON.stringify([{ stream_id: 9, name: 'NPO 1', category_id: '1' }]),
    });
}

function seedXtreamRecord(lastRefresh: number) {
    return makePlaylistRecord({
        id: 'src-old',
        type: 'xtream',
        url: source.url,
        username: source.user,
        password: source.pass,
        lastRefresh,
    });
}

describe('xtream-refresh (stale-catalog auto-refresh)', () => {
    afterEach(() => {
        resetXtreamRefreshForTests();
        resetPersistForTests();
        resetState();
    });

    it('re-imports a stale catalog and repoints the active source at the fresh id', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            scriptRefreshRoutes(http);
            await storage.bulkPut('playlists', [seedXtreamRecord(Date.now() - XTREAM_REFRESH_TTL_MS - 1)], (r) => r.id);
            setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-old');
            tick();

            expect(await refreshActiveXtreamSource('boot')).toBe(true);
            tick();
            const activeId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
            expect(activeId).not.toBe('src-old');
            const playlists = await storage.getAll('playlists');
            expect(playlists).toHaveLength(1);
            expect(playlists[0]?.id).toBe(activeId);
        });
    });

    it('boot leaves a fresh catalog alone; manual always refreshes', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            scriptRefreshRoutes(http);
            await storage.bulkPut('playlists', [seedXtreamRecord(Date.now())], (r) => r.id);
            setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'src-old');
            tick();

            expect(await refreshActiveXtreamSource('boot')).toBe(false);
            expect(http.calls).toHaveLength(0);

            expect(await refreshActiveXtreamSource('manual')).toBe(true);
            expect(http.calls.length).toBeGreaterThan(0);
        });
    });

    it('is a safe no-op when the active source is not an Xtream record', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.bulkPut('playlists', [makePlaylistRecord({ id: 'm3u-1', type: 'm3u-url' })], (r) => r.id);
            setValue(PLAYLIST_ACTIVE_SOURCE_ID, 'm3u-1');
            tick();
            expect(await refreshActiveXtreamSource('manual')).toBe(false);
        });
    });
});
