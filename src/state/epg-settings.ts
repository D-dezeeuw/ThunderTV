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

/**
 * The newest programme `stop` seen in the last parsed feed, epoch ms — or
 * `0` before anything has been parsed.
 *
 * Recorded at ingest rather than derived from stored rows, because
 * `prune.ts` deletes everything more than 24h past its stop: against a feed
 * that has stopped being updated, the stored set is *empty*, so there is
 * nothing left to measure staleness from. This value is what lets the Guide
 * say "the data ends on 28 Oct" instead of rendering a blank grid and
 * leaving the viewer to guess whether the app is broken.
 */
export const EPG_FEED_THROUGH = 'settings.epgFeedThrough';

export type EpgCacheFeedbackState = 'idle' | 'busy' | 'done' | 'failed';

export function initEpgSettingsState(): void {
    setValue(EPG_CACHE_STATE, 'idle' satisfies EpgCacheFeedbackState);
    setValue(EPG_CATALOG_COUNT, 0);
    setValue(EPG_FEED_THROUGH, 0);
}
