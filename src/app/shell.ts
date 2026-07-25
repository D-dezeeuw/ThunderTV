import { computed, defineFn, watch, type State } from 'spektrum';
import { ROUTE_VALUES, parseHash, type Route } from './router';

/**
 * Registers `navigate`, the rail's route-button click handler (index.html's
 * `data-action="click" data-fn="navigate"`). Settings binds directly to
 * `toggleSettings` instead (Feature 02.3.8: it toggles the overlay panel,
 * not the view container, so it has no reason to go through this action or
 * touch `location.hash` at all).
 */
export function registerNavigateAction(): void {
    defineFn('navigate', (el) => {
        const view = el.dataset['view'];
        if (!view) return;
        location.hash = `#/${view}`;
    });
}

/**
 * Registers one `computed('view.<route>.active', ...)` per route (Feature
 * 02.5.2) — index.html's per-section `data-if` binds to these, never to a
 * raw `ui.activeView === '...'` comparison repeated in markup.
 */
export function registerViewActiveComputeds(): void {
    for (const route of ROUTE_VALUES) {
        computed(`view.${route}.active`, ['ui.activeView'], (state: State) => {
            return (state as { ui?: { activeView?: Route } }).ui?.activeView === route;
        });
    }
}

/**
 * `connect.detected` (Feature 02.4.6/02.4.7): re-parses the *current*
 * `location.hash` — already resolved by router.ts's single hashchange
 * listener — purely to learn whether params were present. Never reads or
 * stores the params themselves; router.ts remains the only writer of
 * `ui.activeView`, this only adds a second, unrelated key.
 */
export function registerConnectDetection(): void {
    watch(['ui.activeView'], (state) => {
        const active = (state as { ui?: { activeView?: Route } }).ui?.activeView;
        if (active !== 'connect') return;
        const { params } = parseHash(location.hash);
        computed('connect.detected', ['ui.activeView'], () => params.toString().length > 0);
    });
}
