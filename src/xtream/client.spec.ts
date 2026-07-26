import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { authenticate, getLiveCategories, getLiveStreams } from './client';
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
            expect(result).toEqual({ ok: true, data: { authenticated: true, status: 'Active', expiresAt: 2_000_000_000_000 } });
        });
    });

    it('authenticate tolerates string "1" auth and a null exp_date (never-expiring)', async () => {
        await withFakePlatform({}, async ({ http }) => {
            http.onGet(apiUrl(source, '')).reply({
                kind: 'ok',
                body: JSON.stringify({ user_info: { auth: '1', status: 'Active', exp_date: null } }),
            });
            const result = await authenticate(source);
            expect(result).toEqual({ ok: true, data: { authenticated: true, status: 'Active', expiresAt: null } });
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
});
