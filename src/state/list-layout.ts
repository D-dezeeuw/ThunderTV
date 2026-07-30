import { setValue } from 'spektrum';

/**
 * Which of the two presentations the shared channel list uses — the rows it
 * has always drawn, or a poster grid — remembered per browsing view rather
 * than globally: a channel list and a movie catalog want opposite defaults,
 * and one shared switch would make every trip to Live undo the choice made
 * in Movies.
 *
 * Only the three views that actually offer the switch have an entry. Radio
 * and Categories share the same virtual list but show no toggle, so they
 * stay on the list layout — a mode with no visible control is a mode nobody
 * can turn off.
 *
 * Pure constants/types/helpers only, no `persist()` import — same import
 * cycle `list-state.ts`'s header documents (`registry-*.ts` imports these key
 * constants). `list-layout.actions.ts` holds the write path.
 */
export const UI_LIST_LAYOUT = 'ui.listLayout';

export type ListLayout = 'list' | 'grid';

/** The views that carry a layout toggle. Deliberately a subset of `Route`. */
export type LayoutScope = 'live' | 'movies' | 'series';

export const LAYOUT_SCOPES: readonly LayoutScope[] = ['live', 'movies', 'series'];

export type ListLayoutMap = Record<LayoutScope, ListLayout>;

/**
 * List everywhere. The grid is the addition, so nothing about a familiar
 * screen changes until the viewer asks for it — and the choice persists, so
 * asking once is enough.
 */
export const DEFAULT_LIST_LAYOUT: ListLayoutMap = {
    live: 'list',
    movies: 'list',
    series: 'list',
};

export function initListLayoutModule(): void {
    setValue(UI_LIST_LAYOUT, { ...DEFAULT_LIST_LAYOUT });
}

export function isListLayout(value: unknown): value is ListLayout {
    return value === 'list' || value === 'grid';
}

export function isLayoutScope(value: unknown): value is LayoutScope {
    return (LAYOUT_SCOPES as readonly unknown[]).includes(value);
}

/** The scope a route browses under, or `null` for every view without a toggle. */
export function layoutScopeForRoute(route: string | undefined): LayoutScope | null {
    return isLayoutScope(route) ? route : null;
}

/** Whether `route` is currently showing the grid — the one question both the container class and the windowing controller ask. */
export function isGridLayout(
    map: Partial<ListLayoutMap> | undefined,
    route: string | undefined,
): boolean {
    const scope = layoutScopeForRoute(route);
    if (!scope) return false;
    return (map?.[scope] ?? DEFAULT_LIST_LAYOUT[scope]) === 'grid';
}
