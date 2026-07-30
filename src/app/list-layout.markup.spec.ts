import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { mountTemplate } from '../shared/testing/bind-dom';
import { UI_LIST_LAYOUT, type ListLayoutMap } from '../state/list-layout';
import { get } from '../state/typed';

/**
 * The list/grid switch, bound the way index.html binds it. Bindings are
 * copied **verbatim** from that file rather than paraphrased — a mirrored
 * spec that quietly "fixes" a binding is how the series episode list shipped
 * with a `data-each` that rendered nothing (state/README.md's "Two Spektrum
 * gotchas").
 */
const TOGGLE_MARKUP = `
    <div class="catalog-search">
        <div class="layout-toggle" role="group" :aria-label="strings.layout.group" data-testid="movies-layout-toggle">
            <button
                type="button"
                class="layout-toggle__btn"
                :class="{ 'layout-toggle__btn--active': ui.listLayout.movies !== 'grid' }"
                :aria-pressed="ui.listLayout.movies !== 'grid'"
                data-scope="movies"
                data-layout="list"
                data-action="click"
                data-fn="list/setLayout"
                data-testid="movies-layout-list"
            ></button>
            <button
                type="button"
                class="layout-toggle__btn"
                :class="{ 'layout-toggle__btn--active': ui.listLayout.movies === 'grid' }"
                :aria-pressed="ui.listLayout.movies === 'grid'"
                data-scope="movies"
                data-layout="grid"
                data-action="click"
                data-fn="list/setLayout"
                data-testid="movies-layout-grid"
            ></button>
        </div>
    </div>
    <div class="list" :class="{ 'list--grid': listGridActive }" data-testid="channel-list"></div>
`;

describe('list/grid switch markup (DOM-bound)', () => {
    it('starts on the list layout and flips the whole view when the grid button is clicked', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(TOGGLE_MARKUP);
            setValue('ui.activeView', 'movies');
            tick();

            const listBtn = mounted.query('[data-testid="movies-layout-list"]');
            const gridBtn = mounted.query('[data-testid="movies-layout-grid"]');
            const list = mounted.query('[data-testid="channel-list"]');
            expect(listBtn?.getAttribute('aria-pressed')).toBe('true');
            expect(list?.classList.contains('list--grid')).toBe(false);

            gridBtn?.click();
            tick();

            expect(get<ListLayoutMap>(UI_LIST_LAYOUT)?.movies).toBe('grid');
            expect(gridBtn?.getAttribute('aria-pressed')).toBe('true');
            expect(listBtn?.getAttribute('aria-pressed')).toBe('false');
            expect(list?.classList.contains('list--grid')).toBe(true);

            mounted.cleanup();
        });
    });

    it('leaves the list alone while a view that has no switch is open', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(TOGGLE_MARKUP);
            setValue('ui.activeView', 'movies');
            tick();
            mounted.query('[data-testid="movies-layout-grid"]')?.click();
            tick();

            // Radio shares this virtual list but shows no toggle, so it must
            // not inherit Movies' grid.
            setValue('ui.activeView', 'radio');
            tick();
            expect(
                mounted.query('[data-testid="channel-list"]')?.classList.contains('list--grid'),
            ).toBe(false);

            mounted.cleanup();
        });
    });
});
