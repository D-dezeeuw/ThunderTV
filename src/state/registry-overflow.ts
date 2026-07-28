import { SETTINGS_AUDIO_LANGUAGE, SETTINGS_NAV_MOVIES, SETTINGS_NAV_SERIES, SETTINGS_SUBTITLE_LANGUAGE } from './settings';
import { PLAYER_AUDIO_TRACKS, PLAYER_SUBTITLE_TRACKS, PLAYER_TRACK_MENU, TRACK_LIST_CAP } from './player-tracks';
import { SEARCH_ACTIVE, SEARCH_LOADED_ONLY, SEARCH_QUERY, SEARCH_RESULT_COUNTS, SEARCH_SCOPE } from './search';
import {
    SERIES_ACTIVE_CATEGORY_ID,
    SERIES_CATEGORIES,
    SERIES_CATEGORIES_CAP,
    SERIES_COUNT,
    SERIES_DETAIL,
    SERIES_DETAIL_ERROR_REASON,
    SERIES_DETAIL_ID,
    SERIES_DETAIL_STATUS,
    SERIES_ERROR_REASON,
    SERIES_STATUS,
    SERIES_WARM_STATUS,
} from './series';
import {
    VOD_ACTIVE_CATEGORY_ID,
    VOD_CATEGORIES,
    VOD_CATEGORIES_CAP,
    VOD_COUNT,
    VOD_DETAIL,
    VOD_DETAIL_ID,
    VOD_ERROR_REASON,
    VOD_STATUS,
    VOD_WARM_STATUS,
} from './vod';
import { PLAYER_AUDIO_MODE } from './player';
import type { KeyMeta } from './registry';

/**
 * `KEY_REGISTRY`'s overflow: entries that no longer fit in `registry.ts`,
 * merged back in there via one spread. `registry.ts` has been sitting on the
 * 400-line hard ESLint ceiling (`max-lines`, `eslint.config.js`) since Phase
 * 21's ~20 Movies/Series/Search entries, and trimming existing entries'
 * prose to make room costs more than it saves — so anything added after that
 * lands here regardless of which module owns it (the file started out
 * catalog-only, hence its original name; the track-menu and audio-only-TV
 * `player` entries below are the ones that aren't). `KEY_REGISTRY` itself
 * (`registry.ts`) is still the single object every consumer (`persist.ts`,
 * `bulk-policy.ts`, `index.ts`'s `rehydrateState()`) reads — this file only
 * changes *how* it gets built, not what it is.
 */
export const OVERFLOW_REGISTRY_ENTRIES: Record<string, KeyMeta> = {
    // --- vod (Phase 21 Movies catalog) ---
    [VOD_CATEGORIES]: {
        owner: 'vod',
        persisted: false,
        maxItems: VOD_CATEGORIES_CAP,
        description: 'Compact {id,name} list from get_vod_categories, country-first sorted (catalog-sort.ts) — module memory (vod-rows.ts) holds the full XtreamCategory[]/items; this is only the picker\'s row set.',
    },
    [VOD_ACTIVE_CATEGORY_ID]: {
        owner: 'vod',
        persisted: false,
        description: 'The Movies category currently selected/open — drives vod.actions.ts\'s "superseded mid-flight" check.',
    },
    [VOD_STATUS]: {
        owner: 'vod',
        persisted: false,
        description: 'idle/loading/ready/error — the Movies catalog\'s own status, independent of any one category\'s fetch.',
    },
    [VOD_ERROR_REASON]: {
        owner: 'vod',
        persisted: false,
        description: 'no-source (no active, fully-credentialed Xtream account) | fetch-failed | null — enum-ish, UI-copy-free (state/README.md\'s rule); the UI stage maps each to its own message.',
    },
    [VOD_COUNT]: {
        owner: 'vod',
        persisted: false,
        description: 'Item count of the currently-selected VOD category — same "count, not rows" role as live.ts\'s RADIO_COUNT.',
    },
    [VOD_DETAIL_ID]: {
        owner: 'vod',
        persisted: false,
        description: 'streamId of the currently-open movie detail, or null — vod.actions.ts\'s openVodDetail()/closeVodDetail().',
    },
    [VOD_DETAIL]: {
        owner: 'vod',
        persisted: false,
        description: 'Denormalized snapshot for the open movie (VodItem fields + get_vod_info once fetched) — always written via replace(), never set(), since two movies\' differing optional fields would otherwise bleed together (state/README.md\'s merge-hazard finding).',
    },
    [VOD_WARM_STATUS]: {
        owner: 'vod',
        persisted: false,
        description: 'idle/warming/warmed/skipped — the background full-catalog warm\'s status (vod-warm.ts). Never persisted: recomputed from the tier + the storage-cached warm-meta\'s own freshness every session.',
    },

    // --- series (Phase 21 TV Shows catalog) ---
    [SERIES_CATEGORIES]: {
        owner: 'series',
        persisted: false,
        maxItems: SERIES_CATEGORIES_CAP,
        description: 'Same shape/role as vod.categories, for get_series_categories.',
    },
    [SERIES_ACTIVE_CATEGORY_ID]: {
        owner: 'series',
        persisted: false,
        description: 'The Series category currently selected/open.',
    },
    [SERIES_STATUS]: {
        owner: 'series',
        persisted: false,
        description: 'idle/loading/ready/error — same role as vod.status.',
    },
    [SERIES_ERROR_REASON]: {
        owner: 'series',
        persisted: false,
        description: 'Same no-source/fetch-failed/null contract as vod.errorReason.',
    },
    [SERIES_COUNT]: {
        owner: 'series',
        persisted: false,
        description: 'Item count of the currently-selected series category.',
    },
    [SERIES_DETAIL_ID]: {
        owner: 'series',
        persisted: false,
        description: 'seriesId of the currently-open series detail, or null.',
    },
    [SERIES_DETAIL]: {
        owner: 'series',
        persisted: false,
        description: 'Denormalized snapshot for the open series, including a flattened season-header/episode rows array (rows, series.ts\'s SeriesDetailRow) bounded to SERIES_DETAIL_EPISODES_CAP total episode rows — always written via replace(), same merge-hazard reasoning as vod.detail.',
    },
    [SERIES_DETAIL_STATUS]: {
        owner: 'series',
        persisted: false,
        description: 'idle/loading/ready/error — the OPEN series\' own get_series_info fetch status, distinct from series.status (the category list\'s). Lets the detail panel show a classified error + Retry instead of silently looking empty on a failed fetch.',
    },
    [SERIES_DETAIL_ERROR_REASON]: {
        owner: 'series',
        persisted: false,
        description: 'Same no-source/fetch-failed/null contract as series.errorReason, scoped to series.detailStatus.',
    },
    [SERIES_WARM_STATUS]: {
        owner: 'series',
        persisted: false,
        description: 'Same idle/warming/warmed/skipped contract as vod.warmStatus, for the series background warm (series-warm.ts).',
    },

    // --- search (scoped fuzzy search across channels/movies/series) ---
    [SEARCH_QUERY]: {
        owner: 'search',
        persisted: false,
        description: 'The raw, unnormalized typed query — rankSearch() (src/search/fuzzy.ts) normalizes it once per recomputeSearch() call, never per keystroke twice.',
    },
    [SEARCH_SCOPE]: {
        owner: 'search',
        persisted: false,
        description: '"channels" | "movies" | "series" | "all" — which catalog(s) recomputeSearch() ranks against.',
    },
    [SEARCH_ACTIVE]: {
        owner: 'search',
        persisted: false,
        description: 'True whenever the query is non-blank — lets the UI show/hide a "searching" affordance without re-deriving it from the query string itself.',
    },
    [SEARCH_RESULT_COUNTS]: {
        owner: 'search',
        persisted: false,
        description: '{channels, movies, series} match counts, each scope\'s own (pre-concatenation) rankSearch() result length — stays accurate even when the "all" scope\'s combined row set had to truncate at DEFAULT_SEARCH_LIMIT.',
    },
    [SEARCH_LOADED_ONLY]: {
        owner: 'search',
        persisted: false,
        description: 'True when the active scope includes movies/series and at least one relevant category has never been fetched — an honesty flag, not an error: results are real, just possibly incomplete. Always false for "channels" alone (always fully loaded).',
    },

    // --- settings: audio/subtitle language (Phase 21) ---
    [SETTINGS_AUDIO_LANGUAGE]: {
        owner: 'settings',
        persisted: true,
        description: 'Preferred audio track language (ISO 639-1, default \'en\') — Settings → Playback.',
    },
    [SETTINGS_SUBTITLE_LANGUAGE]: {
        owner: 'settings',
        persisted: true,
        description: '\'auto\' (default, resolved against settings.liveCountry at use time via subtitle-language.ts), \'off\', or an explicit ISO 639-1 code.',
    },

    // --- settings: Movies/Series rail visibility (Phase 21 follow-up) ---
    [SETTINGS_NAV_MOVIES]: {
        owner: 'settings',
        persisted: true,
        description: 'Show the Movies button in the nav rail. Default on, same reasoning as every other rail toggle (settings.ts) — drives rail.movies.visible (ui.selectors.ts).',
    },
    [SETTINGS_NAV_SERIES]: {
        owner: 'settings',
        persisted: true,
        description: 'Show the Series button in the nav rail. Default on — drives rail.series.visible (ui.selectors.ts).',
    },

    // --- player: audio/subtitle track menus (final track-menu stage) ---
    [PLAYER_AUDIO_TRACKS]: {
        owner: 'player',
        persisted: false,
        maxItems: TRACK_LIST_CAP,
        description: 'Compact MediaTrack[] for the dock/theater audio-track popup — republished from getPlayerTracks() on every menu open and every engine track-changed event; never persisted, since a stale list would offer track ids a new attach may not carry.',
    },
    [PLAYER_SUBTITLE_TRACKS]: {
        owner: 'player',
        persisted: false,
        maxItems: TRACK_LIST_CAP,
        description: 'Same role/lifecycle as player.audioTracks, for the subtitle-track popup.',
    },
    [PLAYER_TRACK_MENU]: {
        owner: 'player',
        persisted: false,
        description: "'none' | 'audio' | 'subtitles' — which track popup (if any) is open. Reset to 'none' on every player.active change (state/player-tracks.actions.ts's registerTrackSync()).",
    },

    // --- player: audio-only TV ---
    [PLAYER_AUDIO_MODE]: {
        owner: 'player',
        persisted: true,
        description: 'Play TV channels audio-only, with the Radio visualizer standing in for the picture. A viewing preference (a TV used as a stereo stays that way), so persisted; the player bar always carries the switch back.',
    },
};
