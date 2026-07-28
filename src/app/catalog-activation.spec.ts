import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { get } from '../state/typed';
import { resetVodMemoryForTests } from '../state/vod-rows';
import { initVodState, VOD_ERROR_REASON, VOD_STATUS } from '../state/vod';
import { resetSeriesMemoryForTests } from '../state/series-rows';
import { initSeriesState, SERIES_ERROR_REASON, SERIES_STATUS } from '../state/series';
import { UI_ACTIVE_VIEW } from '../state/ui';
import { registerCatalogActivation, resetCatalogActivationForTests } from './catalog-activation';

/** Drains the microtask queue a few times then ticks — enough for the
 *  fake platform's storage-only "no active Xtream account" resolution
 *  (no real network hop) to settle before an assertion. */
async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    tick();
}

/**
 * `withFakePlatform({}, ...)`'s default capabilities carry no active Xtream
 * source and a `'none'` storage tier, so `openVodCatalog()`/`warmVodCatalog()`
 * (and their series equivalents) resolve to their "no source"/"skipped"
 * branches without ever reaching a scripted HTTP call — exactly
 * `vod.actions.spec.ts`'s own "no active, fully-credentialed account" setup.
 * That keeps this spec about the *activation glue* (did the right call fire,
 * exactly once per session) rather than re-proving the catalog fetch flow
 * itself, which `vod.actions.spec.ts`/`series.actions.spec.ts` already own.
 */
describe('registerCatalogActivation', () => {
    afterEach(() => {
        resetVodMemoryForTests();
        resetSeriesMemoryForTests();
        resetCatalogActivationForTests();
        resetState();
    });

    it('activates the Movies catalog the first time the route becomes active', async () => {
        await withFakePlatform({}, async () => {
            initVodState();
            tick();
            registerCatalogActivation();

            expect(get<string>(VOD_STATUS)).toBe('idle');

            setValue(UI_ACTIVE_VIEW, 'movies');
            tick();
            await flush();

            expect(get<string>(VOD_STATUS)).toBe('error');
            expect(get<string | null>(VOD_ERROR_REASON)).toBe('no-source');
        });
    });

    it("does not re-activate on a second entry into Movies (would otherwise reset the user's category choice)", async () => {
        await withFakePlatform({}, async () => {
            initVodState();
            registerCatalogActivation();

            setValue(UI_ACTIVE_VIEW, 'movies');
            tick();
            await flush();
            expect(get<string>(VOD_STATUS)).toBe('error');

            // Simulate the first activation having already settled onto a
            // real category (e.g. once a source exists) before the user
            // leaves the tab.
            setValue(VOD_STATUS, 'ready');
            tick();

            setValue(UI_ACTIVE_VIEW, 'live');
            tick();
            setValue(UI_ACTIVE_VIEW, 'movies');
            tick();
            await flush();

            // A second activation would have flipped this back to 'loading'/'error'.
            expect(get<string>(VOD_STATUS)).toBe('ready');
        });
    });

    it('activates the Series catalog the first time the route becomes active', async () => {
        await withFakePlatform({}, async () => {
            initSeriesState();
            tick();
            registerCatalogActivation();

            expect(get<string>(SERIES_STATUS)).toBe('idle');

            setValue(UI_ACTIVE_VIEW, 'series');
            tick();
            await flush();

            expect(get<string>(SERIES_STATUS)).toBe('error');
            expect(get<string | null>(SERIES_ERROR_REASON)).toBe('no-source');
        });
    });

    it('leaves both catalogs untouched for every other route', async () => {
        await withFakePlatform({}, async () => {
            initVodState();
            initSeriesState();
            registerCatalogActivation();

            setValue(UI_ACTIVE_VIEW, 'live');
            tick();
            await flush();

            expect(get<string>(VOD_STATUS)).toBe('idle');
            expect(get<string>(SERIES_STATUS)).toBe('idle');
        });
    });
});
