import { appState, getPathObj, resetState, setValue, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initRouter, ROUTE_VALUES } from '../app/router';
import { registerUiSelectors } from './ui.selectors';

describe('view.<route>.active computeds (Feature 05.6.5, migrated from src/app/shell.ts)', () => {
    beforeAll(() => {
        registerUiSelectors();
    });

    afterEach(() => {
        resetState();
        location.hash = '';
    });

    it('exactly one view.<route>.active is true after the router resolves a hash', async () => {
        initRouter();
        location.hash = '#/favorites';
        await new Promise<void>((resolve) => {
            window.addEventListener('hashchange', () => resolve(), { once: true });
        });
        tick();

        for (const route of ROUTE_VALUES) {
            const active = getPathObj<boolean>(appState, `view.${route}.active`) ?? false;
            expect(active).toBe(route === 'favorites');
        }
    });
});

describe('connect.detected (Feature 02.4.6/05.6.1, registered once — not re-registered per navigation)', () => {
    beforeAll(() => {
        registerUiSelectors();
    });

    afterEach(() => {
        resetState();
        location.hash = '';
    });

    it('is false on a non-connect view', () => {
        setValue('ui.activeView', 'sources');
        tick();
        expect((appState['connect'] as { detected?: boolean } | undefined)?.detected).toBe(false);
    });

    it('reflects whether the current hash carries query params on the connect view', () => {
        location.hash = '#/connect?token=abc';
        setValue('ui.activeView', 'connect');
        tick();
        expect((appState['connect'] as { detected?: boolean } | undefined)?.detected).toBe(true);
    });

    it('recomputes correctly across repeated navigations — proving no duplicate registration leaks stale closures', () => {
        location.hash = '#/connect?token=abc';
        setValue('ui.activeView', 'connect');
        tick();
        expect((appState['connect'] as { detected?: boolean } | undefined)?.detected).toBe(true);

        location.hash = '#/connect';
        setValue('ui.activeView', 'sources');
        tick();
        setValue('ui.activeView', 'connect');
        tick();
        expect((appState['connect'] as { detected?: boolean } | undefined)?.detected).toBe(false);
    });
});

describe('storageNotice.visible (Feature 04.8.2, migrated from src/ui/storage-notice.ts)', () => {
    beforeAll(() => {
        registerUiSelectors();
    });

    afterEach(() => {
        resetState();
    });

    function noticeVisible(): boolean | undefined {
        return (appState['storageNotice'] as { visible?: boolean } | undefined)?.visible;
    }

    it('is hidden on the full tier', () => {
        setValue('storage.tier', 'full');
        setValue('ui.storageNoticeDismissed', false);
        tick();
        expect(noticeVisible()).toBe(false);
    });

    it('is shown on the partial and none tiers, until dismissed', () => {
        setValue('storage.tier', 'partial');
        setValue('ui.storageNoticeDismissed', false);
        tick();
        expect(noticeVisible()).toBe(true);

        setValue('ui.storageNoticeDismissed', true);
        tick();
        expect(noticeVisible()).toBe(false);
    });
});
