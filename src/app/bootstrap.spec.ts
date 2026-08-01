import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { makePlaylistRecord } from '../core/storage/fixtures';
import { initListState } from '../state/list';
import { initPlaylistState, PLAYLIST_SOURCES, type PlaylistSourceSummary } from '../state/playlist';
import { initSettingsState } from '../state/settings';
import { get } from '../state/typed';
import { initWizardState, UI_WIZARD_OPEN } from '../state/wizard';
import { supervise, sweepAndLoadPlaylistSources } from './bootstrap';

/**
 * Regression coverage for the tick() race `sweepAndLoadPlaylistSources()`
 * fixes: Spektrum's `setValue()`/`set()` queue a write into a delta that
 * only lands in `appState` on the next `tick()` — normally driven by
 * `run()`'s rAF loop, which this test deliberately never starts (same as
 * every other spec here), so nothing but an explicit `tick()` call could
 * ever make `loadPlaylistSources()`'s write visible to the reads right
 * after it. Before the fix, `applyDefaultConfigIfFirstRun()`'s and
 * `openWizardIfNoSources()`'s `get(PLAYLIST_SOURCES)` calls would see the
 * stale, pre-load empty array in exactly this shape — wrongly opening the
 * first-run wizard for an install that already has a source configured.
 */
describe('sweepAndLoadPlaylistSources() (boot-order tick() race)', () => {
    afterEach(() => {
        resetState();
    });

    it('does not open the wizard when a source is already configured', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            initWizardState();
            initPlaylistState();
            initSettingsState();
            initListState();
            await storage.bulkPut('playlists', [makePlaylistRecord({ id: 's1' })], (r) => r.id);

            await sweepAndLoadPlaylistSources();
            tick();

            expect(get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES)).toHaveLength(1);
            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(false);
        });
    });

    it('still opens the wizard for a genuinely unconfigured install', async () => {
        await withFakePlatform({}, async () => {
            initWizardState();
            initPlaylistState();
            initSettingsState();
            initListState();

            await sweepAndLoadPlaylistSources();
            tick();

            expect(get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES)).toHaveLength(0);
            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(true);
        });
    });
});

/**
 * The ten boot tasks below `run()` are deliberately not awaited — none may
 * delay first paint. `supervise()` is what keeps "not awaited" from also
 * meaning "failure is invisible": before it, a rejected task surfaced only
 * as an `unhandledrejection` naming a bundled chunk.
 */
describe('supervise() (boot task failures)', () => {
    it('reports a rejected task by name without throwing', async () => {
        const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(() => {
            supervise('epg-mapping', () => Promise.reject(new Error('storage closed')));
        }).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();

        expect(warned).toHaveBeenCalledTimes(1);
        expect(String(warned.mock.calls[0]?.[0])).toContain('epg-mapping');
        warned.mockRestore();
    });

    it('catches a task that throws synchronously, before it ever returns a promise', async () => {
        const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(() => {
            supervise('health-cache', () => {
                throw new Error('bad import');
            });
        }).not.toThrow();
        await Promise.resolve();

        expect(warned).toHaveBeenCalledTimes(1);
        warned.mockRestore();
    });

    it('stays quiet when the task succeeds', async () => {
        const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        supervise('favorites', () => Promise.resolve());
        await Promise.resolve();
        await Promise.resolve();

        expect(warned).not.toHaveBeenCalled();
        warned.mockRestore();
    });
});
