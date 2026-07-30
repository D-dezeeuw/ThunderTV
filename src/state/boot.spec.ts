import { resetState, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initBootState, manageBootOverlay, markChannelDataReady, UI_BOOT_PHASE } from './boot';
import { withFakePlatform } from '../core/platform/fake-platform';
import { initListState, LIST_SELECTED_ID, LIST_VISIBLE_ROWS } from './list';
import { initPlaylistState, PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { get, set } from './typed';
import { initUiState, UI_ACTIVE_VIEW } from './ui';

/** Matches boot.ts's own EXIT_ANIMATION_MS — kept here rather than exported since nothing else needs it. */
const EXIT_ANIMATION_MS = 420;

const SUMMARY: PlaylistSourceSummary = {
    id: 's1',
    type: 'm3u-text',
    name: 'My Playlist',
    url: null,
    channelCount: 1,
    groupCount: 0,
    radioCount: 0,
    drmCount: 0,
    skipped: 0,
    importDate: Date.now(),
    lastRefresh: null,
    needsReupload: false,
};

/**
 * Every test runs under a fake platform: `preselectFirstLiveChannel()`'s
 * `selectChannel()` call persists `ui.listState`, which schedules
 * `persist.ts`'s real 500ms debounced flush — a `setTimeout` that, left
 * unresolved past a `vi.useRealTimers()` teardown, fires for real later and
 * throws (`getPlatform()` with no platform set). `vi.runAllTimersAsync()`
 * at the end of each test drains it deterministically while both the fake
 * timers and the fake platform are still in scope.
 */
describe('boot.ts — the wallpaper splash lifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        resetState();
        vi.useRealTimers();
    });

    it('starts at "loading" and stays there until sourcesLoaded settles', async () => {
        await withFakePlatform({}, async () => {
            initUiState();
            initPlaylistState();
            initListState();
            initBootState();
            tick();
            expect(get<string>(UI_BOOT_PHASE)).toBe('loading');

            let resolveSourcesLoaded!: () => void;
            const sourcesLoaded = new Promise<void>((resolve) => {
                resolveSourcesLoaded = resolve;
            });
            set(PLAYLIST_SOURCES, []);
            const overlay = manageBootOverlay(sourcesLoaded);

            await vi.advanceTimersByTimeAsync(10_000);
            tick();
            // Nothing has ever resolved sourcesLoaded — the splash must not
            // time out and exit on its own.
            expect(get<string>(UI_BOOT_PHASE)).toBe('loading');

            resolveSourcesLoaded();
            await overlay;
            await vi.advanceTimersByTimeAsync(EXIT_ANIMATION_MS);
            tick();
            expect(get<string>(UI_BOOT_PHASE)).toBe('done');
            await vi.runAllTimersAsync();
        });
    });

    it('on an unconfigured install (zero sources), exits without waiting on channel data', async () => {
        await withFakePlatform({}, async () => {
            initUiState();
            initPlaylistState();
            initListState();
            initBootState();
            set(PLAYLIST_SOURCES, []);
            tick();

            const overlay = manageBootOverlay(Promise.resolve());
            await vi.advanceTimersByTimeAsync(1000);
            await overlay;
            tick();

            expect(get<string>(UI_BOOT_PHASE)).toBe('done');
            await vi.runAllTimersAsync();
        });
    });

    it('on a configured install, waits for markChannelDataReady() before exiting', async () => {
        await withFakePlatform({}, async () => {
            initUiState();
            initPlaylistState();
            initListState();
            initBootState();
            set(PLAYLIST_SOURCES, [SUMMARY]);
            tick();

            const overlay = manageBootOverlay(Promise.resolve());
            await vi.advanceTimersByTimeAsync(5000);
            tick();
            expect(get<string>(UI_BOOT_PHASE)).toBe('loading');

            markChannelDataReady();
            await vi.advanceTimersByTimeAsync(1000);
            await overlay;
            tick();
            expect(get<string>(UI_BOOT_PHASE)).toBe('done');
            await vi.runAllTimersAsync();
        });
    });

    it('preselects the first Live row once the splash finishes, when landing on Live with an active source', async () => {
        await withFakePlatform({}, async () => {
            initUiState();
            initPlaylistState();
            initListState();
            initBootState();
            set(UI_ACTIVE_VIEW, 'live');
            set(PLAYLIST_SOURCES, [SUMMARY]);
            set(PLAYLIST_ACTIVE_SOURCE_ID, SUMMARY.id);
            set(LIST_VISIBLE_ROWS, [{ id: 'chan-1', name: 'Channel One' }]);
            tick();

            const overlay = manageBootOverlay(Promise.resolve());
            markChannelDataReady();
            await vi.advanceTimersByTimeAsync(2000);
            await overlay;
            tick();

            expect(get<string | null>(LIST_SELECTED_ID)).toBe('chan-1');
            await vi.runAllTimersAsync();
        });
    });

    it('does not preselect when boot lands somewhere other than Live (an explicit deep link)', async () => {
        await withFakePlatform({}, async () => {
            initUiState();
            initPlaylistState();
            initListState();
            initBootState();
            set(UI_ACTIVE_VIEW, 'movies');
            set(PLAYLIST_SOURCES, [SUMMARY]);
            set(PLAYLIST_ACTIVE_SOURCE_ID, SUMMARY.id);
            set(LIST_VISIBLE_ROWS, [{ id: 'chan-1', name: 'Channel One' }]);
            tick();

            const overlay = manageBootOverlay(Promise.resolve());
            markChannelDataReady();
            await vi.advanceTimersByTimeAsync(2000);
            await overlay;
            tick();

            expect(get<string | null>(LIST_SELECTED_ID)).toBeNull();
            await vi.runAllTimersAsync();
        });
    });

    it('does not preselect when no source is active', async () => {
        await withFakePlatform({}, async () => {
            initUiState();
            initPlaylistState();
            initListState();
            initBootState();
            set(UI_ACTIVE_VIEW, 'live');
            set(PLAYLIST_SOURCES, []);
            set(LIST_VISIBLE_ROWS, []);
            tick();

            const overlay = manageBootOverlay(Promise.resolve());
            await vi.advanceTimersByTimeAsync(2000);
            await overlay;
            tick();

            expect(get<string | null>(LIST_SELECTED_ID)).toBeNull();
            await vi.runAllTimersAsync();
        });
    });
});
