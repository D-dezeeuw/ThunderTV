import { defineFn } from 'spektrum';
import { getPlatform } from '../core/platform';
import { countryForLiveToken } from '../epg/countries';
import { clearFeedBookkeeping } from '../epg/feed-fetch';
import { clearMapping } from '../epg/match';
import { EPG_CACHE_STATE, type EpgCacheFeedbackState } from './epg-settings';
import { loadDefaultEpg, publishEpgCatalogCount } from './epg-load';
import { loadGuideChannels } from './guide-load';
import { refreshLiveRows } from './live.actions';
import { SETTINGS_LIVE_COUNTRY } from './settings';
import { get, set } from './typed';

/**
 * Settings → Diagnostics' two EPG catalog actions (Feature 31.7.4): a
 * manual refresh that bypasses every feed's TTL, and a full clear for
 * troubleshooting or reclaiming space. Neither touches the Guide's
 * `epgChannels`/`epgPrograms` display tables differently from any other
 * ingest — `loadDefaultEpg()`/`loadGuideChannels()` already own that.
 */
export function registerEpgSettingsActions(): void {
    defineFn('settings/refreshEpg', () => {
        void refreshEpgCatalog();
    });
    defineFn('settings/clearEpgCache', () => {
        void clearEpgCache();
    });
}

function setFeedback(state: EpgCacheFeedbackState): void {
    set(EPG_CACHE_STATE, state);
}

/** Force-refetches the selected country's feeds, bypassing every file's TTL — `loadDefaultEpg()` itself re-publishes the catalog count. */
export async function refreshEpgCatalog(): Promise<void> {
    setFeedback('busy');
    try {
        await loadDefaultEpg(true);
        setFeedback('done');
    } catch {
        setFeedback('failed');
    }
}

/**
 * Drops every stored EPG artifact — the country catalog, the Guide's
 * display tables, per-feed ETag/TTL bookkeeping, and the channel mapping —
 * for a genuine "start over," not just a re-derive. A dead catalog that
 * silently keeps matching stale data would be worse than an obviously
 * empty one. Only ETag/TTL bookkeeping is country-scoped (the rest are
 * bulk tables with no reason to keep a second country's leftovers around
 * either, since only one is ever active at a time in this phase).
 */
export async function clearEpgCache(): Promise<void> {
    setFeedback('busy');
    try {
        const storage = getPlatform().storage;
        await storage.clearTable('epgCatalog');
        await storage.clearTable('epgChannels');
        await storage.clearTable('epgPrograms');

        const liveCountryToken = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
        const country = countryForLiveToken(liveCountryToken);
        if (country) {
            await clearFeedBookkeeping(country);
            await clearMapping(liveCountryToken);
        }

        await loadGuideChannels();
        refreshLiveRows();
        if (liveCountryToken) await publishEpgCatalogCount(liveCountryToken);
        setFeedback('done');
    } catch {
        setFeedback('failed');
    }
}
