import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { mountTemplate } from '../shared/testing/bind-dom';
import { get } from '../state/typed';
import { VOD_ACTIVE_CATEGORY_ID } from '../state/vod';

/**
 * End-to-end proof that index.html's Movies/Series category rail, detail
 * panel, and search box actually wire up through the real `bindDOM()`/
 * `data-action` path (Feature 05.10.3's convention, `settings.locale.markup.spec.ts`'s
 * pattern) — hand-authored fragments mirroring the real markup's bindings,
 * not the file itself (nothing in this codebase parses index.html directly;
 * see its own README for why). Router/glue-level behavior is covered by
 * `router.spec.ts`/`catalog-activation.spec.ts`; this spec is only about
 * "does the markup dispatch/render what it says it does."
 */
async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    tick();
}

describe('Movies/Series catalog markup (Phase 21, DOM-bound)', () => {
    it("clicking a category row dispatches vod/selectCategory with that row's own category id", async () => {
        await withFakePlatform({}, async () => {
            const mounted = mountTemplate(`
                <div class="groups-panel__list" data-each="vod.categories">
                    <button
                        type="button"
                        class="groups-panel__item"
                        :class="{ 'groups-panel__item--active': item.id === vod.activeCategoryId }"
                        role="option"
                        :aria-selected="item.id === vod.activeCategoryId"
                        data-action="click"
                        data-fn="vod/selectCategory"
                        :data-category-id="item.id"
                        data-testid="category-chip"
                    ><span class="groups-panel__name truncate">{{ item.name }}</span></button>
                </div>
            `);
            setValue('vod.categories', [
                { id: '1', name: 'Action' },
                { id: '2', name: 'Comedy' },
            ]);
            tick();

            const chips = mounted.queryAll('[data-testid="category-chip"]');
            expect(chips).toHaveLength(2);
            expect(chips[1]?.textContent).toBe('Comedy');

            chips[1]?.click();
            tick();

            // selectVodCategory() sets vod.activeCategoryId synchronously,
            // before its first await — proof the click reached the real
            // vod/selectCategory action with the *second* chip's own id,
            // not the first (a delegated-container mistake would always
            // read the same one).
            expect(get<string | null>(VOD_ACTIVE_CATEGORY_ID)).toBe('2');

            await flush(); // let the (no-source) async tail settle before teardown
            mounted.cleanup();
        });
    });

    /**
     * The accordion row is the first markup in the app to put a `data-if`
     * element *beside* the row button inside a `data-each` — and `data-each`
     * binds by cloning the container's first element child, the same
     * mechanic that silently broke the series detail's nested `data-each`
     * (`src/state/README.md`). So this asserts the clone really is bound
     * per row: the triangle appears only on the head that has variants, and
     * clicking it dispatches that row's own id.
     */
    it('shows the expand triangle only on a category with variants, and toggles that one', () => {
        const mounted = mountTemplate(`
            <div class="groups-panel__list" data-each="vod.categories">
                <div class="groups-panel__row" role="presentation">
                    <button
                        type="button"
                        class="groups-panel__item"
                        :class="{ 'groups-panel__item--active': item.id === vod.activeCategoryId, 'groups-panel__item--variant': item.variant }"
                        data-testid="chip"
                    ><span>{{ item.name }}</span></button>
                    <button
                        type="button"
                        class="groups-panel__toggle"
                        :class="{ 'groups-panel__toggle--open': item.expanded }"
                        data-if="item.hasVariants"
                        :aria-expanded="item.expanded"
                        :data-category-id="item.id"
                        data-testid="toggle"
                    ></button>
                </div>
            </div>
        `);
        setValue('vod.categories', [
            { id: '1', name: 'NETFLIX', hasVariants: true, expanded: false, variant: false },
            { id: '2', name: 'DOCUMENTAIRES', hasVariants: false, expanded: false, variant: false },
        ]);
        tick();

        const toggles = mounted.queryAll('[data-testid="toggle"]');
        expect(toggles).toHaveLength(2);
        expect(toggles[0]?.style.display).not.toBe('none');
        expect(toggles[1]?.style.display).toBe('none'); // no variants — no triangle
        expect(toggles[0]?.dataset['categoryId']).toBe('1');
        expect(toggles[0]?.getAttribute('aria-expanded')).toBe('false');

        // What `vod/toggleCategory` republishes: the head, now open, with
        // its variant behind it.
        setValue('vod.categories', [
            { id: '1', name: 'NETFLIX', hasVariants: true, expanded: true, variant: false },
            { id: '3', name: 'FR', hasVariants: false, expanded: false, variant: true },
            { id: '2', name: 'DOCUMENTAIRES', hasVariants: false, expanded: false, variant: false },
        ]);
        tick();

        expect(mounted.queryAll('[data-testid="chip"]').map((el) => el.textContent)).toEqual([
            'NETFLIX',
            'FR',
            'DOCUMENTAIRES',
        ]);
        const reboundToggles = mounted.queryAll('[data-testid="toggle"]');
        expect(reboundToggles[0]?.getAttribute('aria-expanded')).toBe('true');
        expect(reboundToggles[0]?.classList.contains('groups-panel__toggle--open')).toBe(true);
        expect(mounted.queryAll('[data-testid="chip"]')[1]?.classList.contains('groups-panel__item--variant')).toBe(true);

        mounted.cleanup();
    });

    it('renders the detail panel from a seeded vod.detail snapshot', () => {
        const mounted = mountTemplate(`
            <div data-if="vod.detailId" data-testid="detail-panel">
                <h2 data-testid="detail-title">{{ vod.detail.name }}</h2>
                <p data-testid="detail-meta" data-if="vod.detail.year">{{ vod.detail.year }}</p>
                <p data-testid="detail-plot" data-if="vod.detail.plot">{{ vod.detail.plot }}</p>
            </div>
        `);

        // Absent until a detail is opened.
        expect(mounted.query('[data-testid="detail-panel"]')?.style.display).toBe('none');

        setValue('vod.detailId', 42);
        setValue('vod.detail', {
            streamId: 42,
            name: 'Test Movie',
            categoryId: '1',
            categoryName: 'Action',
            logo: null,
            rating: '8.1',
            year: '2020',
            containerExtension: 'mp4',
            plot: 'A plot worth reading.',
            genre: null,
            durationSecs: null,
            releaseDate: null,
        });
        tick();

        expect(mounted.query('[data-testid="detail-panel"]')?.style.display).not.toBe('none');
        expect(mounted.query('[data-testid="detail-title"]')?.textContent).toBe('Test Movie');
        expect(mounted.query('[data-testid="detail-meta"]')?.textContent).toBe('2020');
        expect(mounted.query('[data-testid="detail-plot"]')?.textContent).toBe('A plot worth reading.');

        mounted.cleanup();
    });

    it('typing in the search input dispatches search/setQueryMovies live, per keystroke', () => {
        const mounted = mountTemplate(`
            <input type="text" data-action="input" data-fn="search/setQueryMovies" data-testid="search-input" />
            <span data-testid="query-echo">{{ search.query }}</span>
            <span data-testid="active-echo">{{ search.active ? 'yes' : 'no' }}</span>
        `);

        const input = mounted.query<HTMLInputElement>('[data-testid="search-input"]');
        expect(input).not.toBeNull();

        input!.value = 'matrix';
        input!.dispatchEvent(new Event('input', { bubbles: true }));
        tick();

        expect(mounted.query('[data-testid="query-echo"]')?.textContent).toBe('matrix');
        expect(mounted.query('[data-testid="active-echo"]')?.textContent).toBe('yes');

        mounted.cleanup();
    });
});
