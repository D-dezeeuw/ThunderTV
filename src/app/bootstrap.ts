import { bindDOM, run } from 'spektrum';
import { createPlatform, setPlatform } from '../core/platform';
import { primeHealthCache } from '../health/store';
import { publishCodexAuthorId } from '../state/codex.actions';
import { refreshCodexLibraryOnBoot } from '../state/codex-library.actions';
import { effectiveProxyTemplate } from '../core/platform/electron-platform';
import { sweepOrphanedPlaylistRows } from '../m3u/import-sweep';
import { registerListBindings } from '../ui/list-bindings';
import { registerSpatialNavigation } from '../ui/spatial/navigator';
import { closeTopmostOverlay } from '../state/back-navigation';
import { listHandlesHorizontal } from '../state/list.actions';
import { registerPlayerBindings } from '../player/bindings';
import { installDebugCapture } from '../state/debug';
import { registerDebugShortcut } from '../state/debug.actions';
import { installDevtools } from '../state/devtools';
import { registerTrackSync } from '../state/player-tracks.actions';
import {
    initAppearance,
    initState,
    loadDefaultEpg,
    loadXtreamGuide,
    loadFavorites,
    loadGuideChannels,
    loadPlaylistSources,
    openWizardIfNoSources,
    primeEpgMapping,
    registerActions,
    registerPersistOnHide,
    registerSelectors,
    rehydrateState,
    seedStrings,
    startEpgTick,
} from '../state';
import { applyDefaultConfigIfFirstRun, loadXtreamAccountPrefill } from '../state/settings.actions';
import { handleStorageDemotion } from '../state/ui.actions';
import { refreshActiveXtreamSource } from '../state/xtream-refresh';
import { seedPlatformDiagnostics } from '../state/ui';
import { registerCatalogActivation } from './catalog-activation';
import { initRouter } from './router';
import { registerViewSwitching } from './views';

/**
 * The real boot order (masterplan §4/§6.4), now complete:
 *   1. platform  — detect Electron vs web, construct the PlatformAdapter (Phase 03)
 *   2. storage   — probe IndexedDB/localStorage/memory, pick a tier (Phase 04, inside createPlatform)
 *   3. state     — seed module defaults, then rehydrate persisted keys (Phase 05)
 *   4. render    — bindDOM(), run() — the restored session renders NOW
 *   5. heavy     — only after render; loads `playlist.sources` from storage (Phase 07)
 *
 * Step 3's ordering is the point of this phase: `initState()` seeds
 * defaults *before* `rehydrateState()` can overwrite them, and both finish
 * *before* `bindDOM()`/`run()` — so a restored `player.active` snapshot is
 * visible on first paint, with zero playlist data loaded (Feature 05.4.6).
 */
export async function bootstrap(): Promise<void> {
    // First line of the boot, before the platform even exists: the errors
    // most worth capturing are the ones thrown before anything renders.
    installDebugCapture();

    const platform = await createPlatform({
        onStorageDemote: handleStorageDemotion,
        // Feature 07.8.1: only ever *called* well after initState()/
        // rehydrateState() below have run — see CreateWebPlatformOptions's
        // own comment for why wiring the getter this early is still safe.
        getProxyTemplate: () => effectiveProxyTemplate(),
    });
    setPlatform(platform);
    seedPlatformDiagnostics(platform.name, platform.capabilities, platform.storage.tier);

    initState();
    await rehydrateState();
    // Pre-paint (Feature 22.5.2): the restored theme/text-size land on
    // <html> before bindDOM() renders anything, so an explicit light-theme
    // user never sees dark content — see src/state/theme.ts.
    initAppearance();
    await seedStrings();

    registerActions();
    registerSelectors();
    registerViewSwitching();
    registerCatalogActivation();

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

    void sweepAndLoadPlaylistSources();
    void loadXtreamAccountPrefill();
    void loadFavorites();
    // Paint whatever EPG data already survived from a previous session
    // immediately, then kick off the (TTL-guarded) bulk XMLTV fetch —
    // loadDefaultEpg() itself republishes guide.channels once it writes
    // anything new (src/state/epg-load.ts). primeEpgMapping() restores the
    // Phase 31 match cache live-rows.ts reads synchronously, so a channel
    // matched in a previous session shows as verified before any fetch.
    void loadGuideChannels();
    void primeEpgMapping();
    // Passive stream health (stone 3): restores the synchronous cache the
    // channel list ranks rows against. Non-blocking like every other
    // background load — an unprimed cache simply means no row is annotated
    // yet, never a wrong annotation.
    void primeHealthCache();
    // Codex (stone 4): surfaces this device's author fingerprint in Settings,
    // creating a keypair on first run. Background — nothing blocks on it.
    void publishCodexAuthorId();
    // Shared Codexes (stone 10): publishes the subscription list, and
    // re-fetches anything past its TTL. Polite by construction — a reload
    // inside the window makes zero upstream requests — and non-blocking,
    // because a followed Codex whose host is down must not delay boot.
    void refreshCodexLibraryOnBoot();
    // The provider's own guide first: it is keyed by the `epg_channel_id`
    // every channel row already carries, so it needs no matching and covers
    // exactly the subscription's channels. `loadDefaultEpg()`'s national
    // catalog runs after it as the fallback for sources that serve no EPG of
    // their own (and it is still what populates the country catalog Live's
    // "EPG-verified" filter reads).
    void loadXtreamGuide().then(() => loadDefaultEpg());
    registerImportDropzoneDragover();
    registerDebugShortcut();
    registerListBindings();
    // Spatial D-pad navigation (stone 8). Registered for every platform, not
    // just TV: it only ever acts on an unmodified arrow press that the
    // focused control does not already handle, so desktop keyboard
    // behaviour is unchanged — and a desktop user gets working arrow-key
    // navigation for free.
    registerSpatialNavigation({ onBack: handleBackPress, listHandlesHorizontal });
    registerPlayerBindings();
    registerTrackSync();
    // Xtream catalogs rot (panels renumber stream ids) — silently re-import
    // the active source when its snapshot is older than the 6h TTL.
    void refreshActiveXtreamSource();
}

/**
 * Feature 07.2.7: the one piece of drag-and-drop wiring that can't be
 * declarative — an HTML5 DnD spec requirement is that *some* listener along
 * the drop target's ancestor chain calls `preventDefault()` on `dragover`,
 * or the browser refuses the drop entirely (default: navigate to the
 * file). Spektrum allows only one `data-action`/`data-fn` pair per element,
 * and the import card's own pair is already spent on `drop` (see
 * index.html) — so this is bound globally instead, once, here. It only
 * ever prevents the default; it dispatches nothing, so a drop anywhere
 * else in the app is inert rather than navigating the tab away.
 */
/**
 * The remote's Back button. Closes whatever overlay is open, in the order a
 * viewer would expect to unwind them; otherwise reports unhandled so the
 * platform can do its own thing (webOS exits the app, a browser goes back).
 */
function handleBackPress(): boolean {
    return closeTopmostOverlay();
}

function registerImportDropzoneDragover(): void {
    document.addEventListener('dragover', (event) => {
        event.preventDefault();
    });
}

/**
 * Feature 07.9.7: the sweep runs before the sources list first loads, so a
 * crash-orphaned row never flashes into view even briefly. The dev-only
 * `desktop/.env` default-config seed runs next — if it fires, it may seed
 * `settings.locale`/`settings.liveCountry` and/or refresh `PLAYLIST_SOURCES`
 * via `saveXtreamAccount()`'s own `loadPlaylistSources()` call (see
 * `settings.actions.ts`'s `applyDefaultConfigIfFirstRun()` for the exact
 * gate). The first-run wizard's "zero sources" check runs last, so it sees
 * whatever sources actually exist by then (real ones from the sweep, or a
 * freshly auto-imported dev default) rather than flashing open and then
 * needing to be dismissed (state/README.md's "First-run setup wizard"
 * section).
 */
async function sweepAndLoadPlaylistSources(): Promise<void> {
    await sweepOrphanedPlaylistRows();
    await loadPlaylistSources();
    await applyDefaultConfigIfFirstRun();
    openWizardIfNoSources();
}
