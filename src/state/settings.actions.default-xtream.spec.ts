import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { getPlatform, resetPlatformForTests, setPlatform } from '../core/platform';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { apiUrl } from '../xtream/urls';
import type { XtreamSource } from '../xtream/types';
import { importDefaultXtreamAccountIfConfigured } from './settings.actions';
import { initSettingsState } from './settings';
import { initPlaylistState, PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { get, set } from './typed';

const SUMMARY: PlaylistSourceSummary = {
    id: 's1',
    type: 'm3u-text',
    name: 'My Playlist',
    url: null,
    channelCount: 10,
    groupCount: 2,
    radioCount: 0,
    drmCount: 0,
    skipped: 0,
    importDate: Date.now(),
    lastRefresh: null,
    needsReupload: false,
};

const defaultAccount = { url: 'http://example.com', username: 'bob', password: 'secret' };

function scriptHappyPath(http: FakeHttpAdapter): void {
    const withSource: XtreamSource = { url: defaultAccount.url, user: defaultAccount.username, pass: defaultAccount.password };
    http.onGet(apiUrl(withSource, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    http.onGet(apiUrl(withSource, 'get_live_categories')).reply({ kind: 'ok', body: '[]' });
    http.onGet(apiUrl(withSource, 'get_live_streams')).reply({ kind: 'ok', body: '[]' });
}

/**
 * `importDefaultXtreamAccountIfConfigured()` (`bootstrap.ts`'s dev-only
 * `desktop/.env` auto-seed) — mirrors `wizard.spec.ts`'s
 * `openWizardIfNoSources()` gate: only ever fires against a genuinely empty
 * `playlist.sources`, since real callers run it in that exact order.
 */
describe('importDefaultXtreamAccountIfConfigured()', () => {
    afterEach(() => {
        resetState();
    });

    it('is a no-op when a playlist source already exists, never reading the platform defaults', async () => {
        await withFakePlatform({}, async ({ platform }) => {
            initSettingsState();
            initPlaylistState();
            set(PLAYLIST_SOURCES, [SUMMARY]);
            tick();

            let calls = 0;
            resetPlatformForTests();
            setPlatform({
                ...platform,
                getDefaultXtreamAccount: () => {
                    calls += 1;
                    return Promise.resolve(defaultAccount);
                },
            });

            await importDefaultXtreamAccountIfConfigured();
            tick();

            expect(calls).toBe(0);
            expect(await getPlatform().storage.getAll('playlists')).toEqual([]);
        });
    });

    it('is a no-op when sources are empty but the platform has no getDefaultXtreamAccount', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initSettingsState();
            initPlaylistState();

            await importDefaultXtreamAccountIfConfigured();
            tick();

            expect(await storage.getAll('playlists')).toEqual([]);
        });
    });

    it('imports and activates the platform default account when no source exists yet', async () => {
        await withFakePlatform({}, async ({ http, storage, platform }) => {
            initSettingsState();
            initPlaylistState();
            scriptHappyPath(http);

            resetPlatformForTests();
            setPlatform({ ...platform, getDefaultXtreamAccount: () => Promise.resolve(defaultAccount) });

            await importDefaultXtreamAccountIfConfigured();
            tick();

            const playlists = await storage.getAll('playlists');
            expect(playlists).toEqual([
                expect.objectContaining({ type: 'xtream', username: defaultAccount.username, password: defaultAccount.password, url: defaultAccount.url }),
            ]);
            expect(get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID)).toBe(playlists[0]?.id);
        });
    });
});
