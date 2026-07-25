import { bindDOM, run, setValue } from 'spektrum';
import { createPlatform, setPlatform } from '../core/platform';
import { registerDensityAction } from '../ui/density';
import { registerEmptyStateComputeds } from '../ui/empty-state';
import { registerFirstRunFilePickerAction } from './first-run-file-picker';
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
 * Steps 1 and 4 exist today: `createPlatform()` decides web vs. Electron and
 * `setPlatform()` installs the result before anything else touches
 * `getPlatform()`, matching masterplan §4/§6.4's boot order. Steps 2-3 are
 * no-ops until their owning phases land.
 */
export async function bootstrap(): Promise<void> {
    const platform = await createPlatform();
    setPlatform(platform);

    // Diagnostics only (Feature 03.8.6) — templates must gate on
    // `platform.capabilities`, never `platform.name`.
    setValue('platform.name', platform.name);
    setValue('platform.capabilities', platform.capabilities);

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
    registerFirstRunFilePickerAction();

    // Resolves the initial route before bindDOM()/run() so a deep link
    // (e.g. #/favorites) renders correctly on first paint (Feature 02.4.4).
    initRouter();

    bindDOM();
    run();
}
