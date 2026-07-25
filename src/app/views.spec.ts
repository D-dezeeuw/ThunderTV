import { bindDOM, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerUiSelectors } from '../state/ui.selectors';
import { initRouter, ROUTE_VALUES } from './router';

describe('view switching', () => {
    let sections: Record<string, HTMLElement>;
    let destroy: () => void;

    beforeAll(() => {
        registerUiSelectors();
        // Resolves the current hash once and subscribes to every future
        // hashchange — the single writer of ui.activeView (Feature 02.4.3).
        initRouter();
    });

    afterEach(() => {
        resetState();
        destroy?.();
        document.body.innerHTML = '';
        location.hash = '';
    });

    function buildFixture(): void {
        sections = {};
        for (const route of ROUTE_VALUES) {
            const el = document.createElement('section');
            el.dataset['if'] = `view.${route}.active`;
            el.id = `section-${route}`;
            document.body.appendChild(el);
            sections[route] = el;
        }
        destroy = bindDOM(document.body);
    }

    function visibleRoutes(): string[] {
        return ROUTE_VALUES.filter((r) => sections[r]?.style.display !== 'none');
    }

    /** hashchange dispatches asynchronously (a queued task, not synchronous
     *  with the location.hash assignment) — awaiting it before tick() is
     *  what makes this test deterministic instead of racing the event. */
    function setHashAndWait(route: string): Promise<void> {
        return new Promise((resolve) => {
            window.addEventListener('hashchange', () => resolve(), { once: true });
            location.hash = `#/${route}`;
        });
    }

    it('shows exactly one section per route, and it is the right one', async () => {
        buildFixture();
        // initRouter()'s initial resolution used history.replaceState (which
        // never fires hashchange) to land on the default route, so the hash
        // is already "#/sources" — priming with a distinct dummy value first
        // guarantees every loop iteration below is a genuine transition.
        await setHashAndWait('__prime__');
        for (const route of ROUTE_VALUES) {
            await setHashAndWait(route);
            tick();
            expect(visibleRoutes()).toEqual([route]);
        }
    });
});
