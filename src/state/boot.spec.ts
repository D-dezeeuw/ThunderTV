import { resetState, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initBootState, manageBootOverlay, markChannelDataReady, UI_BOOT_PHASE } from './boot';
import { initPlaylistState, PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { get, set } from './typed';

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

describe('boot.ts — the wallpaper splash lifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        resetState();
        vi.useRealTimers();
    });

    it('starts at "loading" and stays there until sourcesLoaded settles', async () => {
        initPlaylistState();
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
    });

    it('on an unconfigured install (zero sources), exits without waiting on channel data', async () => {
        initPlaylistState();
        initBootState();
        set(PLAYLIST_SOURCES, []);
        tick();

        const overlay = manageBootOverlay(Promise.resolve());
        await vi.advanceTimersByTimeAsync(1000);
        await overlay;
        tick();

        expect(get<string>(UI_BOOT_PHASE)).toBe('done');
    });

    it('on a configured install, waits for markChannelDataReady() before exiting', async () => {
        initPlaylistState();
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
    });

    it('calls onExitComplete once, after the fade-out animation finishes', async () => {
        initPlaylistState();
        initBootState();
        set(PLAYLIST_SOURCES, []);
        tick();

        const onExitComplete = vi.fn();
        const overlay = manageBootOverlay(Promise.resolve(), onExitComplete);
        await vi.advanceTimersByTimeAsync(1000);
        await overlay;
        tick();

        expect(onExitComplete).toHaveBeenCalledTimes(1);
        expect(get<string>(UI_BOOT_PHASE)).toBe('done');
    });

    it('exits the splash even when the source load rejects', async () => {
        // The failure mode this closes: a rejected sourcesLoaded left
        // `readiness` pending forever, so the overlay never unmounted and
        // sat on top of a working app — including on top of every surface
        // that could explain the failure.
        initPlaylistState();
        initBootState();
        set(PLAYLIST_SOURCES, []);
        tick();
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const overlay = manageBootOverlay(Promise.reject(new Error('IndexedDB is gone')));
        await vi.advanceTimersByTimeAsync(1000);
        await expect(overlay).resolves.toBeUndefined();
        await vi.advanceTimersByTimeAsync(EXIT_ANIMATION_MS);
        tick();

        expect(get<string>(UI_BOOT_PHASE)).toBe('done');
        expect(logged).toHaveBeenCalledTimes(1);
        logged.mockRestore();
    });

    it('is safe to call without onExitComplete', async () => {
        initPlaylistState();
        initBootState();
        set(PLAYLIST_SOURCES, []);
        tick();

        const overlay = manageBootOverlay(Promise.resolve());
        await vi.advanceTimersByTimeAsync(1000);
        await expect(overlay).resolves.toBeUndefined();
    });
});
