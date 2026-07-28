import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { apiUrl } from '../xtream/urls';
import type { XtreamSource } from '../xtream/types';
import { loadXtreamAccountPrefill, saveXtreamAccount } from './settings.actions';
import {
    initSettingsState,
    SETTINGS_XTREAM_ERROR,
    SETTINGS_XTREAM_SAVED,
    SETTINGS_XTREAM_URL,
    SETTINGS_XTREAM_USERNAME,
} from './settings';
import { initPlaylistState, PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';

const source: XtreamSource = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function scriptHappyPath(http: FakeHttpAdapter, withSource: XtreamSource = source): void {
    http.onGet(apiUrl(withSource, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    http.onGet(apiUrl(withSource, 'get_live_categories')).reply({ kind: 'ok', body: '[]' });
    http.onGet(apiUrl(withSource, 'get_live_streams')).reply({ kind: 'ok', body: '[]' });
}

/**
 * `settings/saveXtreamAccount` (Settings → Streaming's Xtream account
 * fields) — reuses `importXtreamSource()`, the exact upsert the Connect-card
 * import form calls, so a save here lands in the same `playlists` row.
 */
describe('saveXtreamAccount()', () => {
    afterEach(() => {
        resetState();
    });

    it('creates a new account and stores it via importXtreamSource()', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSettingsState();
            initPlaylistState();
            scriptHappyPath(http);

            await saveXtreamAccount({ url: source.url, user: source.user, pass: source.pass });
            tick();

            expect(get<string | null>(SETTINGS_XTREAM_ERROR)).toBeNull();
            expect(get<boolean>(SETTINGS_XTREAM_SAVED)).toBe(true);
            expect(get<string>(SETTINGS_XTREAM_URL)).toBe(source.url);
            expect(get<string>(SETTINGS_XTREAM_USERNAME)).toBe(source.user);

            const playlists = await storage.getAll('playlists');
            expect(playlists).toEqual([
                expect.objectContaining({ type: 'xtream', username: 'bob', password: 'secret', url: source.url }),
            ]);
            // The saved source becomes active, mirroring the Connect-card flow.
            expect(get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID)).toBe(playlists[0]?.id);
        });
    });

    it('rejects a save with a missing URL or username, making no request', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSettingsState();
            initPlaylistState();

            await saveXtreamAccount({ url: '', user: 'bob', pass: 'secret' });
            tick();

            expect(get<string | null>(SETTINGS_XTREAM_ERROR)).not.toBeNull();
            expect(get<boolean>(SETTINGS_XTREAM_SAVED)).toBe(false);
            expect(http.calls).toEqual([]);
            expect(await storage.getAll('playlists')).toEqual([]);
        });
    });

    it('rejects a blank password for a brand-new account', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSettingsState();
            initPlaylistState();

            await saveXtreamAccount({ url: source.url, user: source.user, pass: '' });
            tick();

            expect(get<string | null>(SETTINGS_XTREAM_ERROR)).not.toBeNull();
            expect(http.calls).toEqual([]);
            expect(await storage.getAll('playlists')).toEqual([]);
        });
    });

    it('keeps the previously stored password when the field is left blank on update', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSettingsState();
            initPlaylistState();
            scriptHappyPath(http);

            await saveXtreamAccount({ url: source.url, user: source.user, pass: source.pass });
            tick();

            // A second save with the same URL/username and a blank password
            // must reuse the stored credential rather than rejecting the save.
            await saveXtreamAccount({ url: source.url, user: source.user, pass: '' });
            tick();

            expect(get<string | null>(SETTINGS_XTREAM_ERROR)).toBeNull();
            expect(get<boolean>(SETTINGS_XTREAM_SAVED)).toBe(true);
            const playlists = await storage.getAll('playlists');
            expect(playlists).toHaveLength(1);
            expect(playlists[0]?.password).toBe(source.pass);
        });
    });

    it('surfaces a classified provider error and never overwrites the prefill on failure', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSettingsState();
            initPlaylistState();
            http.onGet(apiUrl(source, '')).reply({ kind: 'http', status: 401 });

            await saveXtreamAccount({ url: source.url, user: source.user, pass: source.pass });
            tick();

            expect(get<string | null>(SETTINGS_XTREAM_ERROR)).not.toBeNull();
            expect(get<boolean>(SETTINGS_XTREAM_SAVED)).toBe(false);
            expect(get<string>(SETTINGS_XTREAM_URL)).toBe('');
            expect(await storage.getAll('playlists')).toEqual([]);
        });
    });
});

describe('loadXtreamAccountPrefill()', () => {
    afterEach(() => {
        resetState();
    });

    it('prefills URL/username from the stored Xtream source, never the password', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initSettingsState();
            initPlaylistState();
            scriptHappyPath(http);

            await saveXtreamAccount({ url: source.url, user: source.user, pass: source.pass });
            tick();

            // Simulate a fresh boot: reset the transient prefill and reload it.
            resetState();
            initSettingsState();
            initPlaylistState();
            await loadXtreamAccountPrefill();
            tick();

            expect(get<string>(SETTINGS_XTREAM_URL)).toBe(source.url);
            expect(get<string>(SETTINGS_XTREAM_USERNAME)).toBe(source.user);
            const playlists = await storage.getAll('playlists');
            expect(playlists[0]?.password).toBe(source.pass);
        });
    });

    it('leaves the fields blank when no Xtream source is stored', async () => {
        await withFakePlatform({}, async () => {
            initSettingsState();
            initPlaylistState();

            await loadXtreamAccountPrefill();
            tick();

            expect(get<string>(SETTINGS_XTREAM_URL)).toBe('');
            expect(get<string>(SETTINGS_XTREAM_USERNAME)).toBe('');
        });
    });
});
