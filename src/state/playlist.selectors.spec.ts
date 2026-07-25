import { appState, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PLAYLIST_SOURCE_COUNT } from './playlist';
import { registerPlaylistSelectors } from './playlist.selectors';
import { set } from './typed';

/**
 * Migrated from `src/ui/empty-state.spec.ts`, re-keyed onto the renamed
 * `playlist.sourceCount` (Feature 05.1.2/05.6.1) — the `hasNoSources`
 * computed name itself is unchanged, so `index.html`'s `data-if` binding
 * needed no update.
 */
describe('hasNoSources', () => {
    beforeAll(() => {
        registerPlaylistSelectors();
    });

    afterEach(() => {
        resetState();
    });

    it('is true when playlist.sourceCount is 0', () => {
        set(PLAYLIST_SOURCE_COUNT, 0);
        tick();
        expect(appState['hasNoSources']).toBe(true);
    });

    it('is true when playlist.sourceCount becomes explicitly absent', () => {
        // Same Spektrum sharp edge documented in the original spec: a delta
        // value of `undefined` never triggers dependent computeds to
        // re-run, so `null` is used here to exercise the `?? 0` fallback
        // for real instead of hitting that dead end.
        set(PLAYLIST_SOURCE_COUNT, 5);
        tick();
        set(PLAYLIST_SOURCE_COUNT, null);
        tick();
        expect(appState['hasNoSources']).toBe(true);
    });

    it('flips to false once playlist.sourceCount is positive', () => {
        set(PLAYLIST_SOURCE_COUNT, 0);
        tick();
        expect(appState['hasNoSources']).toBe(true);

        set(PLAYLIST_SOURCE_COUNT, 3);
        tick();
        expect(appState['hasNoSources']).toBe(false);
    });
});
