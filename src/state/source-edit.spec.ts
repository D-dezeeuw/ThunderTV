import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import type { PlaylistRecord } from '../core/storage';
import { apiUrl } from '../xtream/urls';
import type { XtreamSource } from '../xtream/types';
import { initPlaylistState, PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { initSettingsState, SETTINGS_XTREAM_ERROR } from './settings';
import { applySourceEdit, planSourceEdit } from './source-edit';
import { get, set } from './typed';

function xtreamRecord(overrides: Partial<PlaylistRecord> = {}): PlaylistRecord {
    return makePlaylistRecord({
        id: 'src-1',
        type: 'xtream',
        name: 'My provider',
        url: 'http://panel.example:8080',
        username: 'bob',
        password: 'secret',
        ...overrides,
    });
}

/**
 * The half of the feature that is genuinely easy to get wrong: what an edit
 * does to the source's *identity*. Everything else (the modal chrome, the
 * prefill) is either a binding or a one-line ref write.
 */
describe('planSourceEdit()', () => {
    it('treats a password-only change as the same source — the upsert removes the old row itself', () => {
        const plan = planSourceEdit(xtreamRecord(), { url: 'http://panel.example:8080', user: 'bob', pass: 'newpass' });

        expect(plan).toMatchObject({ ok: true, identityChanged: false, removeSourceId: null });
        expect(plan.ok && plan.params.pass).toBe('newpass');
    });

    it('keeps the stored password when the field is left blank', () => {
        const plan = planSourceEdit(xtreamRecord(), { url: 'http://panel.example:8080', user: 'bob', pass: '   ' });

        expect(plan.ok && plan.params.pass).toBe('secret');
    });

    it('normalizes the URL the same way the first-run form does, so a cosmetic edit is not an identity change', () => {
        const plan = planSourceEdit(xtreamRecord(), { url: ' http://panel.example:8080/ ', user: 'bob', pass: '' });

        expect(plan).toMatchObject({ ok: true, identityChanged: false, removeSourceId: null });
    });

    it('marks a changed server URL as an identity change and hands back the row to delete', () => {
        const plan = planSourceEdit(xtreamRecord(), { url: 'http://other.example:8080', user: 'bob', pass: '' });

        expect(plan).toMatchObject({ ok: true, identityChanged: true, removeSourceId: 'src-1' });
    });

    it('does the same for a changed username, and carries the existing name across', () => {
        const plan = planSourceEdit(xtreamRecord(), { url: 'http://panel.example:8080', user: 'alice', pass: '' });

        expect(plan).toMatchObject({ ok: true, identityChanged: true, removeSourceId: 'src-1' });
        expect(plan.ok && plan.params.name).toBe('My provider');
    });

    it('rejects a blank URL or username, and a password it has no stored fallback for', () => {
        expect(planSourceEdit(xtreamRecord(), { url: '', user: 'bob', pass: 'x' })).toEqual({ ok: false, error: 'missing-fields' });
        expect(planSourceEdit(xtreamRecord(), { url: 'http://panel.example', user: ' ', pass: 'x' })).toEqual({
            ok: false,
            error: 'missing-fields',
        });
        // A record with no stored password at all — nothing to fall back on.
        const passwordless = makePlaylistRecord({ id: 'src-1', type: 'xtream', url: 'http://panel.example', username: 'bob' });
        expect(planSourceEdit(passwordless, { url: 'http://panel.example', user: 'bob', pass: '' })).toEqual({
            ok: false,
            error: 'password-required',
        });
    });

    it('refuses a source with no credentials to edit', () => {
        expect(planSourceEdit(makePlaylistRecord({ type: 'm3u-file' }), { url: 'x', user: 'y', pass: 'z' })).toEqual({
            ok: false,
            error: 'not-editable',
        });
        expect(planSourceEdit(undefined, { url: 'x', user: 'y', pass: 'z' })).toEqual({ ok: false, error: 'not-found' });
    });
});

const edited: XtreamSource = { url: 'http://other.example:8080', user: 'bob', pass: 'secret' };

function scriptHappyPath(http: FakeHttpAdapter, source: XtreamSource): void {
    http.onGet(apiUrl(source, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    http.onGet(apiUrl(source, 'get_live_categories')).reply({ kind: 'ok', body: '[]' });
    http.onGet(apiUrl(source, 'get_live_streams')).reply({ kind: 'ok', body: '[]' });
}

describe('applySourceEdit()', () => {
    afterEach(() => {
        resetState();
    });

    it('re-points the source at a new server without leaving the old one behind', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initPlaylistState();
            initSettingsState();
            await storage.bulkPut('playlists', [xtreamRecord()], (r) => r.id);
            set(PLAYLIST_ACTIVE_SOURCE_ID, 'src-1');
            tick();
            scriptHappyPath(http, edited);

            expect(await applySourceEdit('src-1', { url: edited.url, user: edited.user, pass: '' })).toBe(true);
            tick();

            const playlists = await storage.getAll('playlists');
            expect(playlists).toEqual([expect.objectContaining({ type: 'xtream', url: edited.url, username: 'bob', name: 'My provider' })]);
            // The upsert always mints a fresh playlist id, so the pointer that
            // named the row we just deleted has to follow it.
            expect(get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID)).toBe(playlists[0]?.id);
        });
    });

    it('leaves a different source active when the one being edited is not the active one', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initPlaylistState();
            initSettingsState();
            await storage.bulkPut('playlists', [xtreamRecord(), makePlaylistRecord({ id: 'src-2' })], (r) => r.id);
            set(PLAYLIST_ACTIVE_SOURCE_ID, 'src-2');
            tick();
            scriptHappyPath(http, edited);

            expect(await applySourceEdit('src-1', { url: edited.url, user: edited.user, pass: '' })).toBe(true);
            tick();

            expect(get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID)).toBe('src-2');
        });
    });

    it('changes nothing when the provider rejects the edited credentials', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            initPlaylistState();
            initSettingsState();
            await storage.bulkPut('playlists', [xtreamRecord()], (r) => r.id);
            tick();
            http.onGet(apiUrl(edited, '')).reply({ kind: 'http', status: 401 });

            expect(await applySourceEdit('src-1', { url: edited.url, user: edited.user, pass: '' })).toBe(false);
            tick();

            expect(await storage.getAll('playlists')).toEqual([expect.objectContaining({ id: 'src-1', url: 'http://panel.example:8080' })]);
            expect(get<string | null>(SETTINGS_XTREAM_ERROR)).not.toBeNull();
        });
    });
});
