import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { get } from '../state/typed';
import { resetVodMemoryForTests, vodMemory } from '../state/vod-rows';
import { initVodState, VOD_ACTIVE_CATEGORY_ID, VOD_ERROR_REASON, VOD_STATUS, type VodItem } from '../state/vod';
import { LIST_VISIBLE_ROWS } from '../state/list';
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

/** Puts a category's items into module memory, standing in for a fetch that already happened this session. */
function seedVodCategory(categoryId: string, items: VodItem[]): void {
    vodMemory.setItemsFor(categoryId, items, Date.now());
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

    it("re-entry republishes the open category's rows without resetting the viewer's choice", async () => {
        await withFakePlatform({}, async () => {
            initVodState();
            registerCatalogActivation();

            setValue(UI_ACTIVE_VIEW, 'movies');
            tick();
            await flush();
            expect(get<string>(VOD_STATUS)).toBe('error');

            // Simulate the first activation having settled onto a category the
            // viewer drilled into — an id *and* the items behind it, which is
            // what a real settled catalog looks like and what the re-entry
            // republish reads.
            seedVodCategory('7', [{ streamId: 1, name: 'Chosen Movie', categoryId: '7', containerExtension: 'mkv', searchKey: 'chosen movie' }]);
            setValue(VOD_ACTIVE_CATEGORY_ID, '7');
            setValue(VOD_STATUS, 'ready');
            tick();

            setValue(UI_ACTIVE_VIEW, 'live');
            tick();
            setValue(UI_ACTIVE_VIEW, 'movies');
            tick();
            await flush();

            // The whole point of the one-shot guard: a second full activation
            // would have re-run the auto-select and thrown the choice away.
            expect(get<string | null>(VOD_ACTIVE_CATEGORY_ID)).toBe('7');
            expect(get<string>(VOD_STATUS)).toBe('ready');
            // And the shared list carries this view's rows again, rather than
            // whatever the previous view left in it.
            expect((get<{ name: string }[]>(LIST_VISIBLE_ROWS) ?? []).map((r) => r.name)).toEqual(['Chosen Movie']);
        });
    });

    it('falls back to a real open when re-entry finds nothing cached to republish', async () => {
        await withFakePlatform({}, async () => {
            initVodState();
            registerCatalogActivation();

            setValue(UI_ACTIVE_VIEW, 'movies');
            tick();
            await flush();

            setValue(UI_ACTIVE_VIEW, 'live');
            tick();
            setValue(UI_ACTIVE_VIEW, 'movies');
            tick();
            await flush();

            // No category, no items — the only honest answer is to try again,
            // which lands on the same "no source" error as the first attempt.
            expect(get<string>(VOD_STATUS)).toBe('error');
            expect(get<string | null>(VOD_ERROR_REASON)).toBe('no-source');
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
