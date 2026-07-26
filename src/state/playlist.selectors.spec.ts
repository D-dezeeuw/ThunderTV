import { appState, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { registerPlaylistSelectors } from './playlist.selectors';
import { set } from './typed';

function makeSource(overrides: Partial<PlaylistSourceSummary> = {}): PlaylistSourceSummary {
    return {
        id: 's1',
        type: 'm3u-url',
        name: 'Test',
        url: 'https://example.com/list.m3u',
        channelCount: 10,
        groupCount: 2,
        radioCount: 0,
        drmCount: 0,
        skipped: 0,
        importDate: 0,
        lastRefresh: null,
        needsReupload: false,
        ...overrides,
    };
}

describe('hasNoSources (Feature 07.1.8)', () => {
    beforeAll(() => {
        registerPlaylistSelectors();
    });

    afterEach(() => {
        resetState();
    });

    it('is true when playlist.sources is empty', () => {
        set(PLAYLIST_SOURCES, []);
        tick();
        expect(appState['hasNoSources']).toBe(true);
    });

    it('flips to false once a source exists', () => {
        set(PLAYLIST_SOURCES, []);
        tick();
        expect(appState['hasNoSources']).toBe(true);

        set(PLAYLIST_SOURCES, [makeSource()]);
        tick();
        expect(appState['hasNoSources']).toBe(false);
    });
});

describe('activeSource (Feature 05.6.2)', () => {
    beforeAll(() => {
        registerPlaylistSelectors();
    });

    afterEach(() => {
        resetState();
    });

    it('is null when no source is active', () => {
        set(PLAYLIST_SOURCES, [makeSource()]);
        set(PLAYLIST_ACTIVE_SOURCE_ID, null);
        tick();
        expect(appState['activeSource']).toBeNull();
    });

    it('joins activeSourceId against sources', () => {
        const source = makeSource({ id: 's2', name: 'Second' });
        set(PLAYLIST_SOURCES, [makeSource(), source]);
        set(PLAYLIST_ACTIVE_SOURCE_ID, 's2');
        tick();
        expect(appState['activeSource']).toEqual(source);
    });

    it('is null when activeSourceId points at a source that no longer exists', () => {
        set(PLAYLIST_SOURCES, [makeSource()]);
        set(PLAYLIST_ACTIVE_SOURCE_ID, 'missing');
        tick();
        expect(appState['activeSource']).toBeNull();
    });
});
