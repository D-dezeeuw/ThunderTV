import { setValue } from 'spektrum';
import { isPlaybackHandoff, stopPlayback } from '../state/player.actions';

/**
 * Hand-rolled hash router (~50 lines). Owns `location.hash`; `ui.activeView`
 * is written from exactly one place — `applyRoute()` below — so no other
 * module may set that key (Feature 02.4.3).
 */
export type Route =
    | 'live'
    | 'radio'
    | 'movies'
    | 'series'
    | 'categories'
    | 'sources'
    | 'favorites'
    | 'recent'
    | 'guide'
    | 'connect'
    | 'handoff';

export const ROUTE_VALUES: readonly Route[] = [
    'live',
    'radio',
    'movies',
    'series',
    'categories',
    'sources',
    'favorites',
    'recent',
    'guide',
    'connect',
    'handoff',
];

/**
 * `live` — the filtered, deduplicated channel list — is the app's home.
 * `sources` remains reachable (and is the rail's default-visible entry) so
 * a first run with nothing imported still has an obvious next step; the
 * Live view's empty state links straight there even when its rail button
 * has been hidden.
 */
export const DEFAULT_ROUTE: Route = 'live';

function isRoute(value: string): value is Route {
    return (ROUTE_VALUES as readonly string[]).includes(value);
}

export interface ParsedHash {
    path: string;
    params: URLSearchParams;
}

/** Parses "#/path?query" into { path, params }. Pure — never mutates state. */
export function parseHash(hash: string): ParsedHash {
    const withoutPrefix = hash.replace(/^#\/?/, '');
    const separator = withoutPrefix.indexOf('?');
    const path = separator === -1 ? withoutPrefix : withoutPrefix.slice(0, separator);
    const query = separator === -1 ? '' : withoutPrefix.slice(separator + 1);
    return { path, params: new URLSearchParams(query) };
}

/** Resolves a parsed path to a Route, falling back to DEFAULT_ROUTE. */
export function resolveRoute(path: string): Route {
    return isRoute(path) ? path : DEFAULT_ROUTE;
}

/**
 * The route most recently applied — kept here, not read back from
 * `ui.activeView`, since this module already owns writing that key and a
 * plain local avoids a `src/state/` read from `src/app/`. Used only to tell
 * a real tab switch (stop whatever was playing) apart from a redundant
 * same-route hash rewrite (e.g. the initial bare-hash redirect).
 */
let previousRoute: Route | null = null;

/**
 * Stops any active playback when navigating to a genuinely different route —
 * Feature request: switching tabs should not leave the previous tab's stream
 * running underneath.
 *
 * The exception is a navigation a replay asked for: a Starred or Recent pick
 * starts its channel and *then* comes here to show it, so stopping would kill
 * the very stream this route change exists to display
 * (`player.actions.ts`'s `keepPlaybackThroughRoute()`).
 */
function stopPlaybackOnRouteChange(route: Route): void {
    const handoff = isPlaybackHandoff(route);
    if (previousRoute !== null && previousRoute !== route && !handoff) stopPlayback();
    previousRoute = route;
}

function applyRoute(): void {
    const { path } = parseHash(location.hash);

    if (path === '') {
        // Bare "#/" or no hash: redirect to the default route without an
        // extra history entry (Feature 02.4.5).
        history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
        stopPlaybackOnRouteChange(DEFAULT_ROUTE);
        setValue('ui.activeView', DEFAULT_ROUTE);
        return;
    }

    // NOTE (Feature 02.4.6/02.4.7): the "connect" route intentionally never
    // reads or logs its params here — Phase 14 consumes-and-scrubs the
    // fragment via history.replaceState before any request. This router
    // only exposes parseHash()'s params to callers; it never persists them.
    // "handoff" (Phase 38, stone 9) follows the identical discipline in
    // `src/state/handoff.actions.ts`: read once, scrub, then act. Neither
    // route has a view of its own — both hand off to a real one — so
    // resolving them here just parks `ui.activeView` until that happens.
    const route = resolveRoute(path);
    stopPlaybackOnRouteChange(route);
    setValue('ui.activeView', route);
}

/** Resolves the route once at bootstrap (before Spektrum's run()) and
 *  subscribes to hashchange for every route after. */
export function initRouter(): void {
    applyRoute();
    window.addEventListener('hashchange', applyRoute);
}
