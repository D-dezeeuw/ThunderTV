import { appState, getPathObj, setValue } from 'spektrum';
import { applyLocale, isLocale, strings } from '../app/strings';
import { SETTINGS_LOCALE } from './settings';
import { getPlatform } from '../core/platform';
import { initEpgState } from './epg';
import { initEpgSettingsState } from './epg-settings';
import { registerEpgSettingsActions } from './epg-settings.actions';
import { initFavoritesState } from './favorites';
import { registerFavoritesActions } from './favorites.actions';
import { registerFavoritesSelectors } from './favorites.selectors';
import { initCodexState } from './codex';
import { registerCodexActions } from './codex.actions';
import { initCodexLibraryState } from './codex-library';
import { initHandoffState } from './handoff';
import { registerHandoffActions } from './handoff.actions';
import { registerCodexLibraryActions } from './codex-library.actions';
import { initHealthState } from './health';
import { registerHealthActions } from './health.actions';
import { registerGroupActions } from './groups.actions';
import { applyHistoryPolicy } from './history-policy';
import { initImportState } from './import';
import { registerImportSelectors } from './import.selectors';
import { initListState } from './list';
import { initLiveState } from './live';
import { registerLiveActions } from './live.actions';
import { registerLiveSelectors } from './live.selectors';
import { registerListActions } from './list.actions';
import { registerListSelectors } from './list.selectors';
import { initListGroupsState } from './list-groups';
import { initListLayoutModule } from './list-layout';
import { registerListLayoutActions } from './list-layout.actions';
import { initListStateModule } from './list-state';
import { unwrapPersisted } from './persist';
import { initPlayerState } from './player';
import { registerDebugActions } from './debug.actions';
import { initDebugState } from './debug';
import { registerPlayerActions } from './player.actions';
import { initPlayerTracksState } from './player-tracks';
import { registerPlayerTrackActions } from './player-tracks.actions';
import { registerRecentActions } from './recent.actions';
import { registerGuideActions } from './guide.actions';
import { registerGuideSelectors } from './guide.selectors';
import { initGuideState } from './guide';
import { registerPlayerSelectors } from './player.selectors';
import { initPlaylistState } from './playlist';
import { registerPlaylistActions } from './playlist.actions';
import { registerPlaylistSelectors } from './playlist.selectors';
import { persistedKeys } from './registry';
import { registerSearchActions } from './search.actions';
import { initSearchState } from './search';
import { registerSeriesActions } from './series.actions';
import { initSeriesState } from './series';
import { initSettingsState } from './settings';
import { registerSettingsActions } from './settings.actions';
import { initUiState } from './ui';
import { registerUiActions } from './ui.actions';
import { registerUiSelectors } from './ui.selectors';
import { registerDownloadActions } from './downloads.actions';
import { registerDownloadSelectors } from './downloads.selectors';
import { initDownloadsState } from './downloads';
import { registerVodActions } from './vod.actions';
import { initVodState } from './vod';
import { registerXtreamActions } from './xtream.actions';
import { initWizardState } from './wizard';
import { registerWizardActions } from './wizard.actions';
import { seedBlankImage } from './blank-image';

export { flushNow, pendingKeys, persist, registerPersistOnHide } from './persist';
export { setActiveChannel } from './player.actions';
export { setActiveSourceId } from './playlist.actions';
export { handleStorageDemotion } from './ui.actions';
export { initAppearance } from './theme';
export { startEpgTick, stopEpgTick } from './epg';
export { isPersistedKey, KEY_REGISTRY, persistedKeys } from './registry';
export type { KeyMeta } from './registry';
export { pushCapped } from './collections';
export type { ActiveChannelSnapshot } from './records';
export { loadPlaylistSources } from './playlist-load';
export { loadFavorites } from './favorites-load';
export { loadActiveSource } from './list-load';
export { registerViewRowsWatch } from './live.actions';
export { loadGuideChannels } from './guide-load';
export { loadDefaultEpg, primeEpgMapping } from './epg-load';
export { fetchChannelEpgOnDemand, loadXtreamGuide } from './xtream-epg-load';
export { openWizard, openWizardIfNoSources } from './wizard.actions';
export { shouldOpenWizard } from './wizard';
export { openVodCatalog, republishVodRows } from './vod.actions';
export { openSeriesCatalog, republishSeriesRows } from './series.actions';
export { warmVodCatalog } from './vod-warm';
export { warmSeriesCatalog } from './series-warm';

/**
 * Seeds every module's defaults (Feature 05.1.8) — called before
 * rehydration can overwrite anything, and before `run()`. `ui.activeView`
 * is the one key no module seeds here; `initRouter()` (called later, in
 * `bootstrap.ts`) is its sole sanctioned publisher.
 */
export function initState(): void {
    // Static reference data, seeded with the module defaults so every
    // consumer — including the bindDOM test harness, which does not call
    // seedStrings() — can resolve it before the first bind.
    seedBlankImage();
    initPlaylistState();
    initImportState();
    initPlayerState();
    initPlayerTracksState();
    initEpgState();
    initEpgSettingsState();
    initSettingsState();
    initUiState();
    initListState();
    initListStateModule();
    initListLayoutModule();
    initListGroupsState();
    initLiveState();
    initFavoritesState();
    initDebugState();
    initGuideState();
    initWizardState();
    initVodState();
    initSeriesState();
    initSearchState();
    initDownloadsState();
    initHealthState();
    initCodexState();
    initCodexLibraryState();
    initHandoffState();
    applyHistoryPolicy();
}

/** Registers every `defineFn` action across all modules (Feature 05.2.1). */
export function registerActions(): void {
    registerPlaylistActions();
    registerSettingsActions();
    registerPlayerActions();
    registerPlayerTrackActions();
    registerUiActions();
    registerListActions();
    registerListLayoutActions();
    registerGroupActions();
    registerLiveActions();
    registerRecentActions();
    registerFavoritesActions();
    registerDebugActions();
    registerXtreamActions();
    registerGuideActions();
    registerWizardActions();
    registerVodActions();
    registerSeriesActions();
    registerSearchActions();
    registerDownloadActions();
    registerEpgSettingsActions();
    registerHealthActions();
    registerCodexActions();
    registerCodexLibraryActions();
    registerHandoffActions();
}

/** Registers every `computed()` selector across all modules (Feature 05.6.1). */
export function registerSelectors(): void {
    registerPlaylistSelectors();
    registerImportSelectors();
    registerPlayerSelectors();
    registerFavoritesSelectors();
    registerUiSelectors();
    registerListSelectors();
    registerLiveSelectors();
    registerGuideSelectors();
    registerDownloadSelectors();
}

/**
 * Boot rehydration (Feature 05.4.2/05.4.3): reads every key the registry
 * marks `persisted` in one `getMany`, and `setValue`s only the ones that
 * resolved to a real (envelope-valid) value — a missing key or a corrupt
 * blob never clobbers the default `initState()` already seeded (the
 * `getMany` holes contract from Feature 04.3.8).
 */
export async function rehydrateState(): Promise<void> {
    const keys = persistedKeys();
    if (keys.length === 0) return;

    const raw = await getPlatform().storage.getMany(keys);
    raw.forEach((value, i) => {
        const key = keys[i];
        if (key === undefined) return;
        const unwrapped = unwrapPersisted(key, value);
        if (unwrapped !== undefined) setValue(key, unwrapped);
    });
}

/** Test-only: reads a value straight out of `appState` by dotted path. @internal */
export function debugReadState<T>(key: string): T | undefined {
    return getPathObj<T>(appState, key);
}

/**
 * Mirrors the active locale's copy into state once at boot, since
 * `:attr`/`{{}}` bindings can only reach Spektrum state, not a plain TS
 * import. Not a KEY_REGISTRY entry (Feature 05.9.1) — `strings` is static
 * reference data, never itself a persistence candidate (unlike
 * `settings.locale`, which picks it). Called after `rehydrateState()` so
 * a persisted `settings.locale` value is already live in state, and reads
 * it via the same `applyLocale()` the live language switcher uses
 * (`settings.actions.ts`'s `setLocale()`) — the two paths never diverge.
 * Kept here (rather than in `bootstrap.ts`) so every `setValue` call in the
 * app stays inside `src/state/`, with `router.ts`'s `ui.activeView` writes
 * the only sanctioned exception (Feature 05.2.5).
 */
export async function seedStrings(): Promise<void> {
    const locale = getPathObj<string>(appState, SETTINGS_LOCALE);
    // Awaited, not fired-and-forgotten: a non-English user's dictionary is
    // now its own chunk (app/strings.ts), and rendering before it lands
    // would paint the whole shell in English and then swap it out.
    await applyLocale(isLocale(locale) ? locale : 'en');
    setValue('strings', strings);
}
