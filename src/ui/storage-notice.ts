import { computed, defineFn, setValue } from 'spektrum';
import { getPlatform } from '../core/platform';

/**
 * Visible on the `partial`/`none` tiers, hidden on `full`, hidden after
 * dismissal — and re-shown by a runtime demotion even if previously
 * dismissed, because the situation changed (Feature 04.8.2/04.8.4).
 */
export function registerStorageNoticeComputeds(): void {
    computed('storageNotice.visible', ['storage.tier', 'ui.storageNoticeDismissed'], (state) => {
        const tier = (state as { storage?: { tier?: string } }).storage?.tier;
        const dismissed = (state as { ui?: { storageNoticeDismissed?: boolean } }).ui?.storageNoticeDismissed ?? false;
        return (tier === 'partial' || tier === 'none') && !dismissed;
    });
}

/**
 * `dismissStorageNotice` persists the dismissal when the *current* tier can
 * persist it (partial) and stays session-only on `none` (Feature 04.8.5) —
 * an asymmetry that falls straight out of what each tier can actually keep
 * across a reload, not a special case.
 */
export function registerStorageNoticeActions(): void {
    defineFn('dismissStorageNotice', () => {
        setValue('ui.storageNoticeDismissed', true);
        const { storage } = getPlatform();
        if (storage.tier === 'partial') {
            void storage.set('ui.storageNoticeDismissed', true);
        }
    });
}

/** Rehydrates a partial-tier dismissal from a previous session, before bindDOM() paints (called once at boot). */
export async function rehydrateStorageNoticeDismissed(): Promise<void> {
    const { storage } = getPlatform();
    if (storage.tier !== 'partial') return;
    const dismissed = await storage.get<boolean>('ui.storageNoticeDismissed');
    if (dismissed) setValue('ui.storageNoticeDismissed', true);
}

/** Wired as the tier controller's `onDemote` callback (Feature 04.7.5/04.8.4) — republishes the live tier and un-dismisses the notice. */
export function handleStorageDemotion(_from: string, to: string): void {
    setValue('storage.tier', to);
    setValue('ui.storageNoticeDismissed', false);
    setValue('platform.capabilities', getPlatform().capabilities);
}
