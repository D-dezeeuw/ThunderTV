import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { getPlatform, resetPlatformForTests, setPlatform } from '../core/platform';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { apiUrl } from '../xtream/urls';
import type { XtreamSource } from '../xtream/types';
import { applyDefaultConfigIfFirstRun } from './settings.actions';
import { initSettingsState, SETTINGS_LIVE_COUNTRY, SETTINGS_LOCALE } from './settings';
import { initPlaylistState, PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { initWizardState, UI_SETUP_COMPLETE } from './wizard';
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
 * `applyDefaultConfigIfFirstRun()` (`bootstrap.ts`'s dev-only `desktop/.env`
 * auto-seed) — mirrors `wizard.ts`'s `shouldOpenWizard()` gate: only ever
 * fires while the first-run wizard would itself open (setup not complete,
 * zero playlist sources), since real callers run it in that exact order.
 */
describe('applyDefaultConfigIfFirstRun()', () => {
    afterEach(() => {
        resetState();
    });

    it('is a no-op when a playlist source already exists, never reading the platform defaults', async () => {
        await withFakePlatform({}, async ({ platform }) => {
            initSettingsState();
            initPlaylistState();
            initWizardState();
            set(PLAYLIST_SOURCES, [SUMMARY]);
            tick();

            let calls = 0;
            resetPlatformForTests();
            setPlatform({
                ...platform,
                getDefaultConfig: () => {
                    calls += 1;
                    return Promise.resolve({ xtream: defaultAccount, locale: null, liveCountry: null });
                },
            });

            await applyDefaultConfigIfFirstRun();
            tick();

            expect(calls).toBe(0);
            expect(await getPlatform().storage.getAll('playlists')).toEqual([]);
        });
    });

    it('is a no-op when sources are empty but the platform has no getDefaultConfig', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initSettingsState();
            initPlaylistState();
            initWizardState();

            await applyDefaultConfigIfFirstRun();
            tick();

            expect(await storage.getAll('playlists')).toEqual([]);
        });
    });

    it('imports and activates the platform default account when no source exists yet', async () => {
        await withFakePlatform({}, async ({ http, storage, platform }) => {
            initSettingsState();
            initPlaylistState();
            initWizardState();
            scriptHappyPath(http);

            resetPlatformForTests();
            setPlatform({
                ...platform,
                getDefaultConfig: () => Promise.resolve({ xtream: defaultAccount, locale: null, liveCountry: null }),
            });

            await applyDefaultConfigIfFirstRun();
            tick();

            const playlists = await storage.getAll('playlists');
            expect(playlists).toEqual([
                expect.objectContaining({ type: 'xtream', username: defaultAccount.username, password: defaultAccount.password, url: defaultAccount.url }),
            ]);
            expect(get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID)).toBe(playlists[0]?.id);
        });
    });

    it('seeds locale and live-filter country alone, without touching playlist sources', async () => {
        await withFakePlatform({}, async ({ platform }) => {
            initSettingsState();
            initPlaylistState();
            initWizardState();

            resetPlatformForTests();
            setPlatform({
                ...platform,
                getDefaultConfig: () => Promise.resolve({ xtream: null, locale: 'nl', liveCountry: 'NL' }),
            });

            await applyDefaultConfigIfFirstRun();
            tick();

            expect(get<string | null>(SETTINGS_LOCALE)).toBe('nl');
            expect(get<string | null>(SETTINGS_LIVE_COUNTRY)).toBe('NL');
            expect(await getPlatform().storage.getAll('playlists')).toEqual([]);
        });
    });

    it('is a no-op once setup is already marked complete, even with zero sources, never reading the platform defaults', async () => {
        await withFakePlatform({}, async ({ platform }) => {
            initSettingsState();
            initPlaylistState();
            initWizardState();
            setValue(UI_SETUP_COMPLETE, true);
            tick();

            let calls = 0;
            resetPlatformForTests();
            setPlatform({
                ...platform,
                getDefaultConfig: () => {
                    calls += 1;
                    return Promise.resolve({ xtream: defaultAccount, locale: 'nl', liveCountry: 'NL' });
                },
            });

            await applyDefaultConfigIfFirstRun();
            tick();

            expect(calls).toBe(0);
            expect(get<string | null>(SETTINGS_LOCALE)).not.toBe('nl');
            expect(await getPlatform().storage.getAll('playlists')).toEqual([]);
        });
    });
});
