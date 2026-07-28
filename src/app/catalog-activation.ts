import { watch, type State } from 'spektrum';
import { openSeriesCatalog, openVodCatalog, warmSeriesCatalog, warmVodCatalog } from '../state';
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
 */
let moviesActivated = false;
let seriesActivated = false;

export function registerCatalogActivation(): void {
    watch(['ui.activeView'], (state) => {
        const view = (state as ActiveViewState).ui?.activeView;
        if (view === 'movies' && !moviesActivated) {
            moviesActivated = true;
            void openVodCatalog();
            void warmVodCatalog();
        } else if (view === 'series' && !seriesActivated) {
            seriesActivated = true;
            void openSeriesCatalog();
            void warmSeriesCatalog();
        }
    });
}

/** Test-only: resets the one-shot-per-session flags. Never call from app code. */
export function resetCatalogActivationForTests(): void {
    moviesActivated = false;
    seriesActivated = false;
}
