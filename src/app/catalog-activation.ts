import { watch, type State } from 'spektrum';
import {
    openSeriesCatalog,
    openVodCatalog,
    republishSeriesRows,
    republishVodRows,
    warmSeriesCatalog,
    warmVodCatalog,
} from '../state';
import type { Route } from './router';

interface ActiveViewState extends State {
    ui?: { activeView?: Route };
}

/**
 * Movies/Series catalog activation glue (Phase 21) — the app layer's half
 * of the "open the tab, the catalog lazy-loads" contract; `vod.actions.ts`/
 * `series.actions.ts` own the actual fetch/publish flow. Mirrors
 * `views.ts`'s `registerViewSwitching()` shape exactly (a
 * `watch(['ui.activeView'], ...)` registered once, at the same point in
 * `bootstrap.ts`'s boot order) but lives in its own module rather than
 * folded into `views.ts`, which is scoped to scroll/title side effects
 * only, not catalog fetches.
 *
 * **Only the first activation calls in** (the `activated` flags below), not
 * every re-entry: `openVodCatalog()`/`openSeriesCatalog()` unconditionally
 * re-run their "auto-select the first (country-sorted) category" step on
 * every call, including when categories are already fresh — calling that on
 * every Movies/Series tab re-entry would silently reset a user's drilled-
 * down category selection back to the first one each time they left and
 * returned. A one-shot-per-session guard here (not something either state
 * action can fix on its own — that reset-on-reopen behavior is intrinsic to
 * treating "open the catalog" and "pick a category" as one call) keeps
 * "first activation lazy-loads" literal: after that, `vod/selectCategory`'s
 * own TTL check is what decides whether a *deliberate* category reselect
 * re-fetches. `warmVodCatalog()`/`warmSeriesCatalog()` are independently
 * idempotent/TTL-guarded and would be harmless to call every time, but stay
 * behind the same flag for one predictable "activated" moment per view.
 *
 * **Every *later* activation still has to republish rows**, though — that is
 * the half this originally missed. Live, Categories, Movies, Series and
 * Search all publish into one shared virtual list, so whichever view you
 * switch into must (re)publish or the previous view's rows just stay on
 * screen: opening Movies, then TV Shows, then Movies again left the TV Shows
 * list sitting under the Movies tab, and the same in reverse.
 * `live.actions.ts`'s `publishRowsForCurrentView()` already does this for the
 * channel-list views but knows nothing about the catalogs, so the catalogs'
 * own republish — memory only, no fetch, no auto-select, so a drill-down
 * survives — happens here.
 */
let moviesActivated = false;
let seriesActivated = false;

export function registerCatalogActivation(): void {
    watch(['ui.activeView'], (state) => {
        const view = (state as ActiveViewState).ui?.activeView;
        if (view === 'movies') {
            if (!moviesActivated) {
                moviesActivated = true;
                void openVodCatalog();
                void warmVodCatalog();
            } else if (!republishVodRows()) {
                // Nothing cached to republish (the first open failed, or its
                // fetch is still in flight) — a real open is the right answer.
                void openVodCatalog();
            }
        } else if (view === 'series') {
            if (!seriesActivated) {
                seriesActivated = true;
                void openSeriesCatalog();
                void warmSeriesCatalog();
            } else if (!republishSeriesRows()) {
                void openSeriesCatalog();
            }
        }
    });
}

/** Test-only: resets the one-shot-per-session flags. Never call from app code. */
export function resetCatalogActivationForTests(): void {
    moviesActivated = false;
    seriesActivated = false;
}
