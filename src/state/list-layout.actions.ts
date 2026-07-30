import { defineFn } from 'spektrum';
import { persist } from './persist';
import {
    DEFAULT_LIST_LAYOUT,
    isLayoutScope,
    isListLayout,
    UI_LIST_LAYOUT,
    type LayoutScope,
    type ListLayout,
    type ListLayoutMap,
} from './list-layout';
import { get, set } from './typed';

/**
 * The list/grid switch beside each view's search box. Same `data-*` button-
 * group shape as `ui/setDensity` and `ui/setTheme`: two buttons, one action,
 * the choice carried on the element rather than in the action name.
 */
export function registerListLayoutActions(): void {
    defineFn('list/setLayout', (el) => {
        const scope = el.dataset['scope'];
        const layout = el.dataset['layout'];
        if (!isLayoutScope(scope) || !isListLayout(layout)) return;
        setListLayout(scope, layout);
    });
}

/** Exported for direct calls (Feature 05.2.7) — `set()` merges maps, which is exactly right here: only the one scope's entry changes. */
export function setListLayout(scope: LayoutScope, layout: ListLayout): void {
    const current = get<Partial<ListLayoutMap> | undefined>(UI_LIST_LAYOUT);
    if ((current?.[scope] ?? DEFAULT_LIST_LAYOUT[scope]) === layout) return;
    set<Partial<ListLayoutMap>>(UI_LIST_LAYOUT, { [scope]: layout });
    persist(UI_LIST_LAYOUT);
}
