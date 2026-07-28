import { appState, getPathObj, setValue } from 'spektrum';
import { applyLocale, isLocale, strings } from '../app/strings';
import { SETTINGS_LOCALE } from './settings';
import { getPlatform } from '../core/platform';
import { initEpgState } from './epg';
import { initFavoritesState } from './favorites';
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
import { initListStateModule } from './list-state';
import { unwrapPersisted } from './persist';
import { initPlayerState } from './player';
import { registerDebugActions } from './debug.actions';
import { initDebugState } from './debug';
import { registerPlayerActions } from './player.actions';
import { registerRecentActions } from './recent.actions';
import { registerGuideActions } from './guide.actions';
import { registerGuideSelectors } from './guide.selectors';
import { initGuideState } from './guide';
import { registerPlayerSelectors } from './player.selectors';
import { initPlaylistState } from './playlist';
import { registerPlaylistActions } from './playlist.actions';
import { registerPlaylistSelectors } from './playlist.selectors';
import { persistedKeys } from './registry';
import { initSettingsState } from './settings';
import { registerSettingsActions } from './settings.actions';
import { initUiState } from './ui';
import { registerUiActions } from './ui.actions';
import { registerUiSelectors } from './ui.selectors';
import { registerXtreamActions } from './xtream.actions';

export { flushNow, pendingKeys, persist, registerPersistOnHide } from './persist';
export { setActiveChannel } from './player.actions';
export { setActiveSourceId } from './playlist.actions';
export { handleStorageDemotion } from './ui.actions';
export { startEpgTick, stopEpgTick } from './epg';
export { isPersistedKey, KEY_REGISTRY, persistedKeys } from './registry';
export type { KeyMeta } from './registry';
export { pushCapped } from './collections';
export type { ActiveChannelSnapshot } from './records';
export { loadPlaylistSources } from './playlist-load';
export { loadFavoriteIds } from './favorites-load';
export { loadActiveSource } from './list-load';
export { registerViewRowsWatch } from './live.actions';
export { loadGuideChannels } from './guide-load';
export { loadDefaultEpg } from './epg-load';

/**
 * Seeds every module's defaults (Feature 05.1.8) — called before
 * rehydration can overwrite anything, and before `run()`. `ui.activeView`
 * is the one key no module seeds here; `initRouter()` (called later, in
 * `bootstrap.ts`) is its sole sanctioned publisher.
 */
export function initState(): void {
    initPlaylistState();
    initImportState();
    initPlayerState();
    initEpgState();
    initSettingsState();
    initUiState();
    initListState();
    initListStateModule();
    initListGroupsState();
    initLiveState();
    initFavoritesState();
    initDebugState();
    initGuideState();
    applyHistoryPolicy();
}

/** Registers every `defineFn` action across all modules (Feature 05.2.1). */
export function registerActions(): void {
    registerPlaylistActions();
    registerSettingsActions();
    registerPlayerActions();
    registerUiActions();
    registerListActions();
    registerGroupActions();
    registerLiveActions();
    registerRecentActions();
    registerDebugActions();
    registerXtreamActions();
    registerGuideActions();
}

/** Registers every `computed()` selector across all modules (Feature 05.6.1). */
export function registerSelectors(): void {
    registerPlaylistSelectors();
    registerImportSelectors();
    registerPlayerSelectors();
    registerUiSelectors();
    registerListSelectors();
    registerLiveSelectors();
    registerGuideSelectors();
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
export function seedStrings(): void {
    const locale = getPathObj<string>(appState, SETTINGS_LOCALE);
    applyLocale(isLocale(locale) ? locale : 'en');
    setValue('strings', strings);
}
