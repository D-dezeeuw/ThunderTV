import { setValue } from 'spektrum';

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

function applyRoute(): void {
    const { path } = parseHash(location.hash);

    if (path === '') {
        // Bare "#/" or no hash: redirect to the default route without an
        // extra history entry (Feature 02.4.5).
        history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
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
    setValue('ui.activeView', resolveRoute(path));
}

/** Resolves the route once at bootstrap (before Spektrum's run()) and
 *  subscribes to hashchange for every route after. */
export function initRouter(): void {
    applyRoute();
    window.addEventListener('hashchange', applyRoute);
}
