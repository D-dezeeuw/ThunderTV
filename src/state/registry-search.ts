import {
    SEARCH_ALL_SOURCES,
    SEARCH_SWEEP_KIND,
    SEARCH_SWEEP_OPEN,
    SEARCH_SWEEP_PROGRESS,
    SEARCH_SWEEP_STATUS,
} from './search';
import type { KeyMeta } from './registry';

/**
 * `KEY_REGISTRY`'s "search all" leaf — the cross-provider catalog sweep
 * (`catalog-sweep.ts`) and its warning/progress modal. Its own file for the
 * reason `registry-overflow.ts`'s header gives: both that file and
 * `registry-keys.ts` sit on ESLint's 400-line hard ceiling, so a new key
 * goes into whichever themed leaf owns its subject — or a new one, as here.
 *
 * Nothing below persists. A sweep is a session activity like every other
 * `search.*` key: the *catalogs* it fetches are cached for 24h through
 * `catalog-storage.ts` (which is what makes a second sweep cheap), but which
 * mode the search box is in, and how far a particular sweep got, describe
 * one sitting in front of the app and are recomputed from scratch on the
 * next one.
 */
export const SEARCH_SWEEP_REGISTRY_ENTRIES: Record<string, KeyMeta> = {
    [SEARCH_ALL_SOURCES]: {
        owner: 'search',
        persisted: false,
        description: 'True while the movies/series scopes rank over every configured provider\'s swept catalog (catalog-sweep.ts) instead of only the active source\'s loaded categories. Toggled by the "Search all" button beside the search box; search.actions.ts mirrors it in a module variable, since it is flipped and re-ranked in one tick.',
    },
    [SEARCH_SWEEP_OPEN]: {
        owner: 'search',
        persisted: false,
        description: 'The "this takes a while" confirmation/progress modal. Only opens on a cold or stale cache — when every provider is inside the 24h catalog TTL the sweep is local reads and search-all just turns on.',
    },
    [SEARCH_SWEEP_STATUS]: {
        owner: 'search',
        persisted: false,
        description: 'idle | confirm | running | done | cancelled. "confirm" is the pre-flight warning with nothing fetched yet; "done" can still be incomplete — sweepProgress.partial is the honest verdict, never the status alone.',
    },
    [SEARCH_SWEEP_KIND]: {
        owner: 'search',
        persisted: false,
        description: '"vod" | "series" — which catalog the open sweep covers, resolved from ui.activeView at press time (the same rule search/setQueryChannels uses). Also the catalog-storage.ts key prefix.',
    },
    [SEARCH_SWEEP_PROGRESS]: {
        owner: 'search',
        persisted: false,
        description: 'The sweep readout: sourcesTotal/sourcesDone/sourcesFailed, categories and items covered so far, the provider currently being fetched, a 0-100 percent and a "partial" flag. Every field is always written — the modal binds percent to a numeric DOM property, which throws on undefined (state/README.md\'s data-if gotcha). Republished at most every SWEEP_PUBLISH_INTERVAL_MS, plus unthrottled on the terminal state.',
    },
};
