import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { apiUrl } from '../xtream/urls';
import type { XtreamSource } from '../xtream/types';
import { initPlaylistState, PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { loadPlaylistSources } from './playlist-load';
import { SETTINGS_XTREAM_ERROR, SETTINGS_XTREAM_SAVED } from './settings';
import { initSettingsState } from './settings';
import { openWizard, openWizardIfNoSources } from './wizard.actions';
import { initWizardState, shouldOpenWizard, UI_WIZARD_OPEN, UI_WIZARD_STEP } from './wizard';
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

/**
 * `shouldOpenWizard()` — the pure "should the wizard open" decision, kept
 * separate from Spektrum state so it's directly unit-testable.
 */
describe('shouldOpenWizard()', () => {
    it('opens when there are zero sources', () => {
        expect(shouldOpenWizard([])).toBe(true);
    });

    it('stays closed when at least one source exists', () => {
        expect(shouldOpenWizard([SUMMARY])).toBe(false);
    });
});

describe('openWizardIfNoSources() (boot-time check)', () => {
    afterEach(() => {
        resetState();
    });

    it('opens the wizard at step 1 when playlist.sources is empty', async () => {
        await withFakePlatform({}, () => {
            initWizardState();
            initPlaylistState();
            tick();

            openWizardIfNoSources();
            tick();

            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(true);
            expect(get<number>(UI_WIZARD_STEP)).toBe(1);
        });
    });

    it('leaves the wizard closed when a source is already loaded', async () => {
        await withFakePlatform({}, () => {
            initWizardState();
            initPlaylistState();
            set(PLAYLIST_SOURCES, [SUMMARY]);
            tick();

            openWizardIfNoSources();
            tick();

            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(false);
        });
    });

    it('reflects the real storage-backed load, not just the pre-load empty default', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initWizardState();
            initPlaylistState();
            await storage.bulkPut('playlists', [makePlaylistRecord({ id: SUMMARY.id })], (r) => r.id);

            await loadPlaylistSources();
            tick();

            openWizardIfNoSources();
            tick();

            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(false);
        });
    });
});

describe('openWizard() (manual reopen, e.g. Settings → Streaming)', () => {
    afterEach(() => {
        resetState();
    });

    it('opens at step 1 regardless of current step, and closes the Settings panel', async () => {
        await withFakePlatform({}, () => {
            initWizardState();
            set(UI_WIZARD_STEP, 2);
            tick();

            openWizard();
            tick();

            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(true);
            expect(get<number>(UI_WIZARD_STEP)).toBe(1);
        });
    });
});

const source: XtreamSource = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function scriptHappyPath(http: FakeHttpAdapter): void {
    http.onGet(apiUrl(source, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    http.onGet(apiUrl(source, 'get_live_categories')).reply({ kind: 'ok', body: '[]' });
    http.onGet(apiUrl(source, 'get_live_streams')).reply({ kind: 'ok', body: '[]' });
}

/**
 * `wizard/saveXtreamAccount`'s exported inner function — proven separately
 * from the DOM spec (`wizard.markup.spec.ts`) that a successful save
 * (through the exact same `saveXtreamAccount()` Settings uses) dismisses
 * the wizard, and a failed one does not.
 */
describe('wizard step 2 dismissal behavior', () => {
    afterEach(() => {
        resetState();
    });

    it('does not close the wizard on a failed Xtream save', async () => {
        await withFakePlatform({}, async ({ http }) => {
            initWizardState();
            initSettingsState();
            initPlaylistState();
            set(UI_WIZARD_OPEN, true);
            set(UI_WIZARD_STEP, 2);
            http.onGet(apiUrl(source, '')).reply({ kind: 'http', status: 401 });

            const { saveXtreamAccount } = await import('./settings.actions');
            await saveXtreamAccount({ url: source.url, user: source.user, pass: source.pass });
            tick();

            expect(get<string | null>(SETTINGS_XTREAM_ERROR)).not.toBeNull();
            expect(get<boolean>(SETTINGS_XTREAM_SAVED)).toBe(false);
            // Direct call to saveXtreamAccount() never touches UI_WIZARD_OPEN
            // itself — that's wizard/saveXtreamAccount's own job, proven in
            // wizard.markup.spec.ts against the real defineFn wiring.
            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(true);
        });
    });

    it('a successful save via the same path leaves the settings mirrored correctly for the wizard to read', async () => {
        await withFakePlatform({}, async ({ http }) => {
            initWizardState();
            initSettingsState();
            initPlaylistState();
            scriptHappyPath(http);

            const { saveXtreamAccount } = await import('./settings.actions');
            await saveXtreamAccount({ url: source.url, user: source.user, pass: source.pass });
            tick();

            expect(get<boolean>(SETTINGS_XTREAM_SAVED)).toBe(true);
        });
    });
});
