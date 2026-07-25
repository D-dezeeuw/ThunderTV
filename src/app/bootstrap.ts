import { bindDOM, run } from 'spektrum';
import { createPlatform, setPlatform } from '../core/platform';
import { installDevtools } from '../state/devtools';
import {
    initState,
    registerActions,
    registerPersistOnHide,
    registerSelectors,
    rehydrateState,
    seedStrings,
    startEpgTick,
} from '../state';
import { handleStorageDemotion } from '../state/ui.actions';
import { seedPlatformDiagnostics } from '../state/ui';
import { initRouter } from './router';
import { registerViewSwitching } from './views';

/**
 * The real boot order (masterplan §4/§6.4), now complete:
 *   1. platform  — detect Electron vs web, construct the PlatformAdapter (Phase 03)
 *   2. storage   — probe IndexedDB/localStorage/memory, pick a tier (Phase 04, inside createPlatform)
 *   3. state     — seed module defaults, then rehydrate persisted keys (Phase 05)
 *   4. render    — bindDOM(), run() — the restored session renders NOW
 *   5. heavy     — only after render; playlist re-parse (stubbed until Phase 06)
 *
 * Step 3's ordering is the point of this phase: `initState()` seeds
 * defaults *before* `rehydrateState()` can overwrite them, and both finish
 * *before* `bindDOM()`/`run()` — so a restored `player.active` snapshot is
 * visible on first paint, with zero playlist data loaded (Feature 05.4.6).
 */
export async function bootstrap(): Promise<void> {
    const platform = await createPlatform({ onStorageDemote: handleStorageDemotion });
    setPlatform(platform);
    seedPlatformDiagnostics(platform.name, platform.capabilities, platform.storage.tier);

    initState();
    await rehydrateState();
    seedStrings();

    registerActions();
    registerSelectors();
    registerViewSwitching();

    // Resolves the initial route before bindDOM()/run() so a deep link
    // (e.g. #/favorites) renders correctly on first paint (Feature 02.4.4).
    // The router remains ui.activeView's sole sanctioned publisher.
    initRouter();

    bindDOM();
    run();

    // Post-render, non-blocking: neither delays first paint (Feature
    // 05.4.7's restore-cost budget is about steps 1-4 above).
    startEpgTick();
    registerPersistOnHide();
    if (import.meta.env.DEV) installDevtools();

    void loadActiveSource();
}

/**
 * The heavy path (masterplan §6.4's `void loadActiveSource()`) — stubbed
 * until Phase 06's parser exists. Never awaited from `bootstrap()`: a slow
 * heavy load must not delay the restored-session render above (Feature
 * 05.4.9).
 */
function loadActiveSource(): Promise<void> {
    return Promise.resolve();
}
