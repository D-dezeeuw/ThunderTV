import { setValue } from 'spektrum';

/**
 * Settings → Diagnostics' EPG country-catalog readout (Feature 31.7.5):
 * how many channels the catalog knows and how many the matcher resolved,
 * plus feedback for the two manual actions (`epg-settings.actions.ts`'s
 * `refreshEpgCatalog()`/`clearEpgCache()`). `live.stats.epgMatched`
 * already carries the matched count (Live's own filter readout); this
 * module only adds what nothing else already publishes.
 */
export const EPG_CACHE_STATE = 'settings.epgCacheState';
export const EPG_CATALOG_COUNT = 'settings.epgCatalogCount';

export type EpgCacheFeedbackState = 'idle' | 'busy' | 'done' | 'failed';

export function initEpgSettingsState(): void {
    setValue(EPG_CACHE_STATE, 'idle' satisfies EpgCacheFeedbackState);
    setValue(EPG_CATALOG_COUNT, 0);
}
