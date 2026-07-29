import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import {
    authenticate,
    getLiveCategories,
    getLiveStreams,
    getSeries,
    getSeriesCategories,
    getSeriesInfo,
    getVodCategories,
    getVodInfo,
    getVodStreams,
} from './client';
import type { XtreamSource } from './types';
import { apiUrl } from './urls';

const source: XtreamSource = { url: 'http://example.com', user: 'bob', pass: 'secret' };

describe('xtream/client', () => {
    it('authenticate parses a clean active user_info', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({
                kind: 'ok',
                body: JSON.stringify({ user_info: { auth: 1, status: 'Active', exp_date: '2000000000' } }),
            });
            const result = await authenticate(source);
            expect(result).toEqual({ ok: true, data: { authenticated: true, status: 'Active', expiresAt: 2_000_000_000_000, allowedOutputFormats: [] } });
        });
    });

    it('authenticate tolerates string "1" auth and a null exp_date (never-expiring)', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({
                kind: 'ok',
                body: JSON.stringify({ user_info: { auth: '1', status: 'Active', exp_date: null } }),
            });
            const result = await authenticate(source);
            expect(result).toEqual({ ok: true, data: { authenticated: true, status: 'Active', expiresAt: null, allowedOutputFormats: [] } });
        });
    });

    it('authenticate parses allowed_output_formats when the provider sends it', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({
                kind: 'ok',
                body: JSON.stringify({ user_info: { auth: 1, status: 'Active', allowed_output_formats: ['m3u8', 'ts'] } }),
            });
            const result = await authenticate(source);
            expect(result.ok && result.data.allowedOutputFormats).toEqual(['m3u8', 'ts']);
        });
    });

    it('authenticate classifies auth: 0 as auth-failed, never as a parse/network error', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 0 } }) });
            const result = await authenticate(source);
            expect(result).toEqual({ ok: false, error: { kind: 'auth-failed', action: 'authenticate' } });
        });
    });

    it('authenticate classifies an HTML login page as auth-failed', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({ kind: 'ok', body: '<html><body>login required</body></html>' });
            const result = await authenticate(source);
            expect(result).toEqual({ ok: false, error: { kind: 'auth-failed', action: '' } });
        });
    });

    it('authenticate classifies a 401 as auth-failed and a 500 as http', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({ kind: 'http', status: 401 });
            expect(await authenticate(source)).toEqual({ ok: false, error: { kind: 'auth-failed', action: '' } });
        });
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({ kind: 'http', status: 500 });
            expect(await authenticate(source)).toEqual({ ok: false, error: { kind: 'http', action: '' } });
        });
    });

    it('getLiveCategories normalizes clean rows and tolerates string ids', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_live_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '1', category_name: 'NL | ENTERTAINMENT' }]),
            });
            const result = await getLiveCategories(source);
            expect(result).toEqual({ ok: true, data: [{ id: '1', name: 'NL | ENTERTAINMENT' }] });
        });
    });

    it('getLiveCategories skips a row missing an id, never throws', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_live_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_name: 'no id' }, { category_id: '2', category_name: 'ok' }]),
            });
            const result = await getLiveCategories(source);
            expect(result).toEqual({ ok: true, data: [{ id: '2', name: 'ok' }] });
        });
    });

    it('getLiveStreams normalizes clean rows and treats empty-string icon/epg as absent', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_live_streams')).reply({
                kind: 'ok',
                body: JSON.stringify([
                    { stream_id: 10, name: 'NPO 1', category_id: '1', stream_icon: '', epg_channel_id: '' },
                ]),
            });
            const result = await getLiveStreams(source);
            expect(result).toEqual({ ok: true, data: [{ streamId: 10, name: 'NPO 1', categoryId: '1' }] });
        });
    });

    it('getLiveStreams handles the object-as-array wire shape', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_live_streams')).reply({
                kind: 'ok',
                body: JSON.stringify({ '0': { stream_id: '5', name: 'X', category_id: '9' } }),
            });
            const result = await getLiveStreams(source);
            expect(result).toEqual({ ok: true, data: [{ streamId: 5, name: 'X', categoryId: '9' }] });
        });
    });

    it('getLiveStreams classifies a CORS/network failure', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_live_streams')).reply({ kind: 'cors-or-network', crossOrigin: true, offlineHint: false });
            const result = await getLiveStreams(source);
            expect(result).toEqual({ ok: false, error: { kind: 'cors-or-network', action: 'get_live_streams' } });
        });
    });

    it('authenticate keeps mixed-content distinct from cors-or-network (http provider on an https page)', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({ kind: 'mixed-content' });
            const result = await authenticate(source);
            expect(result).toEqual({ ok: false, error: { kind: 'mixed-content', action: '' } });
        });
    });

    it('getVodCategories normalizes clean rows via the shared category normalizer', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_vod_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '3', category_name: 'ACTION' }]),
            });
            const result = await getVodCategories(source);
            expect(result).toEqual({ ok: true, data: [{ id: '3', name: 'ACTION' }] });
        });
    });

    it('getVodStreams appends category_id only when given, and normalizes dirty rows', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_vod_streams')).reply({
                kind: 'ok',
                body: JSON.stringify([
                    { stream_id: '55', name: 'Movie A', category_id: null, rating: 8.5, added: '1700000000' },
                    { stream_id: 56, name: 'Movie B', category_id: '2', container_extension: '' },
                ]),
            });
            const result = await getVodStreams(source);
            expect(result).toEqual({
                ok: true,
                data: [
                    {
                        streamId: 55,
                        name: 'Movie A',
                        categoryId: 'uncategorized',
                        containerExtension: 'mp4',
                        rating: '8.5',
                        added: 1_700_000_000_000,
                    },
                    { streamId: 56, name: 'Movie B', categoryId: '2', containerExtension: 'mp4' },
                ],
            });
        });

        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_vod_streams', '&category_id=7')).reply({
                kind: 'ok',
                body: JSON.stringify([{ stream_id: 1, name: 'X', category_id: '7', container_extension: 'mkv' }]),
            });
            const result = await getVodStreams(source, '7');
            expect(result).toEqual({
                ok: true,
                data: [{ streamId: 1, name: 'X', categoryId: '7', containerExtension: 'mkv' }],
            });
        });
    });

    it('getVodInfo pulls plot/genre/duration/release from the nested info object, dropping absent fields', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_vod_info', '&vod_id=9')).reply({
                kind: 'ok',
                body: JSON.stringify({ info: { plot: 'A story', duration_secs: '5400', releasedate: '2021-01-01' } }),
            });
            const result = await getVodInfo(source, 9);
            expect(result).toEqual({
                ok: true,
                data: { plot: 'A story', durationSecs: 5400, releaseDate: '2021-01-01' },
            });
        });
    });

    it('getVodInfo tolerates a missing info object, never throws', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_vod_info', '&vod_id=9')).reply({ kind: 'ok', body: JSON.stringify({}) });
            const result = await getVodInfo(source, 9);
            expect(result).toEqual({ ok: true, data: {} });
        });
    });

    it('getSeriesCategories normalizes clean rows', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_series_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '1', category_name: 'DRAMA' }]),
            });
            const result = await getSeriesCategories(source);
            expect(result).toEqual({ ok: true, data: [{ id: '1', name: 'DRAMA' }] });
        });
    });

    it('getSeries normalizes a null category_id to uncategorized and keeps clean rows unchanged', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_series')).reply({
                kind: 'ok',
                body: JSON.stringify([
                    { series_id: '3', name: 'Show A', category_id: null },
                    { series_id: 4, name: 'Show B', category_id: '9', rating: 7 },
                ]),
            });
            const result = await getSeries(source);
            expect(result).toEqual({
                ok: true,
                data: [
                    { seriesId: 3, name: 'Show A', categoryId: 'uncategorized' },
                    { seriesId: 4, name: 'Show B', categoryId: '9', rating: '7' },
                ],
            });
        });
    });

    it('getSeriesInfo coerces the object-keyed episodes shape into a sorted season map', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_series_info', '&series_id=12')).reply({
                kind: 'ok',
                body: JSON.stringify({
                    episodes: { '1': [{ id: '100', episode_num: 1, title: 'Pilot' }] },
                }),
            });
            const result = await getSeriesInfo(source, 12);
            expect(result).toEqual({
                ok: true,
                data: [{ season: 1, episodes: [{ episodeId: 100, season: 1, episode: 1, title: 'Pilot', containerExtension: 'mp4' }] }],
            });
        });
    });

    it('getSeriesInfo returns an empty season array for a payload without usable episodes, never throws', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, 'get_series_info', '&series_id=12')).reply({
                kind: 'ok',
                body: JSON.stringify({ info: {} }),
            });
            const result = await getSeriesInfo(source, 12);
            expect(result).toEqual({ ok: true, data: [] });
        });
    });
});
