import { appState, bindDOM, resetState, setValue, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import {
    handleStorageDemotion,
    registerStorageNoticeActions,
    registerStorageNoticeComputeds,
    rehydrateStorageNoticeDismissed,
} from './storage-notice';

function noticeVisible(): boolean | undefined {
    return (appState['storageNotice'] as { visible?: boolean } | undefined)?.visible;
}

function dismissed(): boolean | undefined {
    return (appState['ui'] as { storageNoticeDismissed?: boolean } | undefined)?.storageNoticeDismissed;
}

describe('storage notice visibility (Feature 04.8.2)', () => {
    beforeAll(() => {
        registerStorageNoticeComputeds();
    });

    afterEach(() => {
        resetState();
    });

    it('is hidden on the full tier', () => {
        setValue('storage.tier', 'full');
        setValue('ui.storageNoticeDismissed', false);
        tick();
        expect(noticeVisible()).toBe(false);
    });

    it('is shown on the partial tier', () => {
        setValue('storage.tier', 'partial');
        setValue('ui.storageNoticeDismissed', false);
        tick();
        expect(noticeVisible()).toBe(true);
    });

    it('is shown on the none tier', () => {
        setValue('storage.tier', 'none');
        setValue('ui.storageNoticeDismissed', false);
        tick();
        expect(noticeVisible()).toBe(true);
    });

    it('is hidden after dismissal', () => {
        setValue('storage.tier', 'none');
        setValue('ui.storageNoticeDismissed', true);
        tick();
        expect(noticeVisible()).toBe(false);
    });
});

describe('dismissStorageNotice action (Feature 04.8.5)', () => {
    beforeAll(() => {
        registerStorageNoticeActions();
    });

    afterEach(() => {
        resetState();
    });

    it('sets ui.storageNoticeDismissed and persists on the partial tier', async () => {
        await withFakePlatform({ durableStorage: 'partial' }, async ({ storage }) => {
            const btn = document.createElement('button');
            btn.setAttribute('data-action', 'click');
            btn.setAttribute('data-fn', 'dismissStorageNotice');
            document.body.appendChild(btn);
            const destroy = bindDOM(document.body);

            btn.click();
            tick();
            await Promise.resolve();

            expect(dismissed()).toBe(true);
            expect(await storage.get('ui.storageNoticeDismissed')).toBe(true);

            destroy();
            btn.remove();
        });
    });

    it('sets ui.storageNoticeDismissed without persisting on the none tier', async () => {
        await withFakePlatform({ durableStorage: 'none' }, async ({ storage }) => {
            const btn = document.createElement('button');
            btn.setAttribute('data-action', 'click');
            btn.setAttribute('data-fn', 'dismissStorageNotice');
            document.body.appendChild(btn);
            const destroy = bindDOM(document.body);

            btn.click();
            tick();
            await Promise.resolve();

            expect(dismissed()).toBe(true);
            expect(await storage.get('ui.storageNoticeDismissed')).toBeUndefined();

            destroy();
            btn.remove();
        });
    });
});

describe('rehydrateStorageNoticeDismissed (Feature 04.8.5)', () => {
    afterEach(() => {
        resetState();
    });

    it('restores a prior partial-tier dismissal before first paint', async () => {
        await withFakePlatform({ durableStorage: 'partial' }, async ({ storage }) => {
            await storage.set('ui.storageNoticeDismissed', true);
            await rehydrateStorageNoticeDismissed();
            tick();
            expect(dismissed()).toBe(true);
        });
    });

    it('does nothing on the none tier (nothing to rehydrate)', async () => {
        await withFakePlatform({ durableStorage: 'none' }, async () => {
            await rehydrateStorageNoticeDismissed();
            expect(dismissed()).toBeUndefined();
        });
    });
});

describe('handleStorageDemotion (Feature 04.7.5/04.8.4)', () => {
    afterEach(() => {
        resetState();
    });

    it('republishes storage.tier and un-dismisses a previously dismissed notice', async () => {
        await withFakePlatform({}, () => {
            setValue('ui.storageNoticeDismissed', true);
            handleStorageDemotion('full', 'partial');
            tick();

            expect((appState['storage'] as { tier?: string } | undefined)?.tier).toBe('partial');
            expect(dismissed()).toBe(false);
        });
    });
});
