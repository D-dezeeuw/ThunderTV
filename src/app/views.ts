import { refs, watch, type State } from 'spektrum';
import type { Route } from './router';
import { strings } from './strings';

interface ActiveViewState extends State {
    ui?: { activeView?: Route };
}

/**
 * Read live (not hoisted into a module-scope map) so a locale switch is
 * reflected the next time this recomputes — `strings` is a reassigned
 * singleton (`app/strings.ts`), a precomputed `Record<Route, string>` built
 * once at import time would go stale the moment the language changes.
 */
function titleFor(route: Route): string {
    return strings.views[route].title;
}

// Per-view scroll position, in module memory — this is per-view UI state,
// not durable data, so it deliberately does not live in Spektrum state
// (Feature 02.5.5; Phase 05 formalizes the memory-vs-state split).
const scrollPositions = new Map<Route, number>();
let previousView: Route | null = null;

function viewContainer(): HTMLElement | undefined {
    return refs['viewContainer'] as HTMLElement | undefined;
}

/**
 * Wires view switching's two side effects: saving/restoring each view's
 * scroll position and setting `document.title`. The future player dock and
 * settings panel live outside `<main>` (index.html), so none of this ever
 * tears down playback.
 */
export function registerViewSwitching(): void {
    // `settings.locale` is a dependency too (not just `ui.activeView`) so a
    // live language switch retitles the current view immediately, without
    // requiring a navigation to trigger the recompute.
    watch(['ui.activeView', 'settings.locale'], (state) => {
        const next = (state as ActiveViewState).ui?.activeView;
        if (!next) return;

        const container = viewContainer();
        if (previousView && previousView !== next && container) {
            scrollPositions.set(previousView, container.scrollTop);
        }

        document.title = `${strings.appName} — ${titleFor(next)}`;

        // The new view's `data-if` becomes visible on Spektrum's next tick
        // (run()'s rAF loop), so restoring scrollTop must wait one frame —
        // otherwise it targets a still-hidden, zero-height container.
        requestAnimationFrame(() => {
            const el = viewContainer();
            if (el) el.scrollTop = scrollPositions.get(next) ?? 0;
        });

        previousView = next;
    });
}
