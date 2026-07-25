import { bindDOM, run, setValue } from 'spektrum';
import { registerDensityAction } from '../ui/density';
import { registerEmptyStateComputeds } from '../ui/empty-state';
import { initRouter } from './router';
import { registerSettingsPanelActions } from './settings-panel';
import {
    registerConnectDetection,
    registerNavigateAction,
    registerViewActiveComputeds,
} from './shell';
import { strings } from './strings';
import { registerViewSwitching } from './views';

const DEMO_ROWS = [
    'Sample Channel One',
    'Sample Channel Two',
    'Sample Channel Three',
    'Sample Channel Four',
];

/**
 * Application bootstrap — the single place main.ts delegates to.
 *
 * Real boot order once the owning phases land:
 *   1. platform — detect Electron vs web, construct the PlatformAdapter (Phase 03)
 *   2. storage  — probe IndexedDB/localStorage/memory, pick a tier (Phase 04)
 *   3. connect  — parse a #/connect bookmark URL, if present, before render (Phase 14)
 *   4. render   — rehydrate persisted state, bindDOM(), run() (Phase 05 onward)
 *
 * Only step 4 exists today: the real app shell (rail, router, view
 * switching, settings panel, density) built in Phase 02. Steps 1-3 are
 * no-ops until their owning phases land.
 */
export function bootstrap(): void {
    // Static reference data seeded once, read by :attr/{{}} bindings —
    // strings.ts is a plain TS module, not Spektrum state, so bindings need
    // it mirrored into state to reach it (see src/app/strings.ts).
    setValue('strings', strings);

    // Stub state Phase 07 (playlist import) replaces with real data; every
    // binding reading it (hasNoSources, etc.) needs no changes when that
    // happens.
    setValue('sources.count', 0);
    setValue('demoRows', DEMO_ROWS);

    setValue('ui.density', 'comfortable');
    setValue('ui.settingsOpen', false);

    registerEmptyStateComputeds();
    registerViewActiveComputeds();
    registerConnectDetection();
    registerNavigateAction();
    registerSettingsPanelActions();
    registerDensityAction();
    registerViewSwitching();

    // Resolves the initial route before bindDOM()/run() so a deep link
    // (e.g. #/favorites) renders correctly on first paint (Feature 02.4.4).
    initRouter();

    bindDOM();
    run();
}
