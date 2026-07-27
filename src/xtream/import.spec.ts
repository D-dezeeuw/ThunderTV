import { describe, expect, it } from 'vitest';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { importXtreamSource } from './import';
import { apiUrl } from './urls';
import type { XtreamSource } from './types';

const source: XtreamSource = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function scriptHappyPath(http: FakeHttpAdapter): void {
    http.onGet(apiUrl(source, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    http.onGet(apiUrl(source, 'get_live_categories')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { category_id: '1', category_name: 'UK | SPORTS' },
            { category_id: '2', category_name: 'NL | ENTERTAINMENT' },
        ]),
    });
    http.onGet(apiUrl(source, 'get_live_streams')).reply({
        kind: 'ok',
        body: JSON.stringify([
            { stream_id: 1, name: 'BBC One', category_id: '1' },
            { stream_id: 2, name: 'NPO 1', category_id: '2' },
            { stream_id: 3, name: 'Ziggo Sport', category_id: '2' },
        ]),
    });
}

describe('xtream/import', () => {
    it('imports channels, groups them by category, and orders Dutch categories first', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            scriptHappyPath(http);
            const outcome = await importXtreamSource({ url: source.url, user: source.user, pass: source.pass, name: 'My IPTV' });
            expect(outcome.ok).toBe(true);
            if (!outcome.ok) return;
            expect(outcome.summary).toEqual({
                sourceId: outcome.summary.sourceId,
                total: 3,
                groupCount: 2,
                skipped: 0,
                updated: false,
            });

            const channels = await storage.getRange('channels', [outcome.summary.sourceId, 0], [outcome.summary.sourceId, 999]);
            expect(channels.map((c) => c.group)).toEqual(['NL | ENTERTAINMENT', 'NL | ENTERTAINMENT', 'UK | SPORTS']);
            expect(channels.map((c) => c.name)).toEqual(['NPO 1', 'Ziggo Sport', 'BBC One']);
            expect(channels[0]?.url).toBe('http://example.com/live/bob/secret/2.m3u8');

            const groups = await storage.getRange('groups', [outcome.summary.sourceId, ''], [outcome.summary.sourceId, '￿']);
            expect(groups.map((g) => g.name)).toEqual(['NL | ENTERTAINMENT', 'UK | SPORTS']);

            const playlists = await storage.getAll('playlists');
            expect(playlists).toEqual([
                expect.objectContaining({ type: 'xtream', name: 'My IPTV', username: 'bob', password: 'secret', channelCount: 3, groupCount: 2 }),
            ]);
        });
    });

    it('bakes .ts stream URLs when the provider does not allow m3u8 output', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            http.onGet(apiUrl(source, '')).reply({
                kind: 'ok',
                body: JSON.stringify({ user_info: { auth: 1, status: 'Active', allowed_output_formats: ['ts'] } }),
            });
            http.onGet(apiUrl(source, 'get_live_categories')).reply({
                kind: 'ok',
                body: JSON.stringify([{ category_id: '1', category_name: 'NL' }]),
            });
            http.onGet(apiUrl(source, 'get_live_streams')).reply({
                kind: 'ok',
                body: JSON.stringify([{ stream_id: 7, name: 'NPO 1', category_id: '1' }]),
            });
            const outcome = await importXtreamSource({ url: source.url, user: source.user, pass: source.pass, name: 'X' });
            expect(outcome.ok).toBe(true);
            if (!outcome.ok) return;
            const channels = await storage.getRange('channels', [outcome.summary.sourceId, 0], [outcome.summary.sourceId, 9]);
            expect(channels[0]?.url).toBe('http://example.com/live/bob/secret/7.ts');
        });
    });

    it('re-importing the same url+user upserts in place instead of creating a second source', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            scriptHappyPath(http);
            const first = await importXtreamSource({ url: source.url, user: source.user, pass: source.pass, name: 'My IPTV' });
            http.reset();
            scriptHappyPath(http);
            const second = await importXtreamSource({ url: source.url, user: source.user, pass: source.pass, name: 'My IPTV' });

            expect(first.ok && second.ok).toBe(true);
            if (!first.ok || !second.ok) return;
            expect(second.summary.updated).toBe(true);
            expect(second.summary.sourceId).not.toBe(first.summary.sourceId);

            const playlists = await storage.getAll('playlists');
            expect(playlists).toHaveLength(1);
        });
    });

    it('surfaces an auth-failed error without writing any rows', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            http.onGet(apiUrl(source, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 0 } }) });
            const outcome = await importXtreamSource({ url: source.url, user: source.user, pass: source.pass, name: 'My IPTV' });
            expect(outcome).toEqual({ ok: false, error: { kind: 'auth-failed', action: 'authenticate' } });
            expect(await storage.getAll('playlists')).toEqual([]);
        });
    });
});
