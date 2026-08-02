import {
    SETTINGS_AUDIO_LANGUAGE,
    SETTINGS_LIVE_EPG_VERIFIED_ONLY,
    SETTINGS_NAV_MOVIES,
    SETTINGS_NAV_SERIES,
    SETTINGS_SUBTITLE_LANGUAGE,
} from './settings';
import { FAVORITES_ROWS } from './favorites';
import { EPG_REGISTRY_ENTRIES } from './registry-epg';
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
    SERIES_NEXT_PROMPT,
    SERIES_ERROR_REASON,
    SERIES_STALE,
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
    VOD_STALE,
    VOD_STATUS,
    VOD_WARM_STATUS,
} from './vod';
import { PLAYER_AUDIO_MODE } from './player';
import { DOWNLOAD_QUEUE_CAP, DOWNLOADS_ACTIVE_ID, DOWNLOADS_ITEMS } from './downloads';
import { GUIDE_CHANNELS, GUIDE_LOADING, GUIDE_OFFSET_MS, GUIDE_SELECTED_KEY } from './guide';
import { CODEX_AUTHOR_ID, CODEX_MESSAGE, CODEX_STATE } from './codex';
import { CODEX_BLOCKED_ROWS, CODEX_LIBRARY_MESSAGE, CODEX_LIBRARY_ROWS, CODEX_LIBRARY_STATE } from './codex-library';
import { HANDOFF_LINK, HANDOFF_MESSAGE, HANDOFF_STATE } from './handoff';
import { HEALTH_CLEARED, HEALTH_DEAD_COUNT, HEALTH_TRACKED_COUNT } from './health';
import { SEARCH_SWEEP_REGISTRY_ENTRIES } from './registry-search';
import { UI_REGISTRY_ENTRIES } from './registry-ui';
import type { KeyMeta } from './registry';

/**
 * `KEY_REGISTRY`'s overflow: entries that no longer fit in `registry.ts`,
 * merged back in there via one spread. `registry.ts` has been sitting on the
 * 400-line hard ESLint ceiling (`max-lines`, `eslint.config.js`) since Phase
 * 21's ~20 Movies/Series/Search entries, and trimming existing entries'
 * prose to make room costs more than it saves — so anything added after that
 * lands here regardless of which module owns it (the file started out
 * catalog-only, hence its original name; the track-menu and audio-only-TV
 * `player` entries below are the ones that aren't). This file has since hit
 * the same ceiling, so new entries go into a themed leaf spread in below.
 */
export const OVERFLOW_REGISTRY_ENTRIES: Record<string, KeyMeta> = {
    ...EPG_REGISTRY_ENTRIES,
    ...SEARCH_SWEEP_REGISTRY_ENTRIES,
    ...UI_REGISTRY_ENTRIES,
    // --- vod (Phase 21 Movies catalog) ---
    [VOD_CATEGORIES]: {
        owner: 'vod',
        persisted: false,
        maxItems: VOD_CATEGORIES_CAP,
        description: 'The Movies category accordion\'s VISIBLE rows (catalog-category-tree.ts): one head per streaming service, popularity/country sorted (catalog-sort.ts), plus the variants of whichever heads are open. Module memory (vod-rows.ts) holds the full XtreamCategory[]/items and the rail\'s own grouping; this is only what the picker draws, so a collapsed variant is absent from it and an expanded one carries a shortened label — read a category\'s full name via vodCategoryName(), never back out of here.',
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
        mapShaped: true,
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
        description: 'Same shape/role as vod.categories, including the service accordion, for get_series_categories.',
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
        mapShaped: true,
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
    [SERIES_NEXT_PROMPT]: {
        owner: 'series',
        persisted: false,
        mapShaped: true,
        description: 'The standing "Next: S02E01 — title" offer after an episode ends (Feature 21.6.4), or null. Never persisted: an offer only means anything while the player still holds the episode that produced it, so one restored at boot would point at a session that no longer exists. Cleared by setActiveChannel() on any new playback, including accepting the offer itself. Written via replace(), same merge-hazard reasoning as series.detail.',
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
        description: '"channels" | "radio" | "movies" | "series" | "all" — which catalog(s) recomputeSearch() ranks against. "radio" is "channels" over the Radio row set; Live and Radio share one input, so it is resolved from ui.activeView when that input fires.',
    },
    [SEARCH_ACTIVE]: {
        owner: 'search',
        persisted: false,
        description: 'True whenever the query is non-blank — lets the UI show/hide a "searching" affordance without re-deriving it from the query string itself.',
    },
    [SEARCH_RESULT_COUNTS]: {
        owner: 'search',
        persisted: false,
        description: '{channels, movies, series} match counts, each scope\'s own (pre-concatenation) rankSearch() result length (radio stations count as channels) — stays accurate even when the "all" scope\'s combined row set had to truncate at DEFAULT_SEARCH_LIMIT.',
    },
    [SEARCH_LOADED_ONLY]: {
        owner: 'search',
        persisted: false,
        description: 'True when the active scope includes movies/series and at least one relevant category has never been fetched — an honesty flag, not an error: results are real, just possibly incomplete. Always false for "channels"/"radio" alone (both always fully loaded).',
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
        description: "'none' | 'audio' | 'subtitles' | 'visualizer' — which dock popup (if any) is open. 'visualizer' is Radio's preset picker, which shares this key so two popups can never be open at once (it publishes no track list of its own). Reset to 'none' on every player.active change (state/player-tracks.actions.ts's registerTrackSync()).",
    },

    // --- player: audio-only TV ---
    [PLAYER_AUDIO_MODE]: {
        owner: 'player',
        persisted: true,
        description: 'Play TV channels audio-only, with the Radio visualizer standing in for the picture. A viewing preference (a TV used as a stereo stays that way), so persisted; the player bar always carries the switch back.',
    },

    // --- catalog offline fallback ---
    [VOD_STALE]: {
        owner: 'vod',
        persisted: false,
        description:
            'True while the Movies catalog on screen came from a cache whose TTL had expired, because the refresh failed (offline, or the panel is down). Never persisted: it describes this session\'s last fetch attempt, and a restored `true` would accuse a perfectly healthy boot of being offline before it had tried anything.',
    },
    [SERIES_STALE]: {
        owner: 'series',
        persisted: false,
        description: 'Same role as vod.stale, for the TV Shows catalog.',
    },

    // --- downloads (save a movie to disk) ---
    [DOWNLOADS_ITEMS]: {
        owner: 'downloads',
        persisted: false,
        maxItems: DOWNLOAD_QUEUE_CAP,
        description:
            'The download queue, one compact entry per movie (id/name/filename/status/percent/sizeLabel). Never persisted: the destination handle and the transfer itself belong to the session that started them, so a restored queue would show rows nothing could resume — a browser reload genuinely does abandon an in-flight download.',
    },
    [DOWNLOADS_ACTIVE_ID]: {
        owner: 'downloads',
        persisted: false,
        description:
            'Id of the one transfer currently running, or null. The queue is serial (most Xtream panels cap concurrent connections per account), so this is a single id rather than a set, and it is what downloads.actions.ts guards late progress/completion callbacks against.',
    },

    // --- guide (EPG display) ---
    // Owner `epg`: the Guide view is the EPG's display surface, and
    // `epg.ts`'s `epg.tick` (already `epg`-owned) is what drives it — a
    // separate `'guide'` owner would split one concern across two names.
    // These four went unregistered when the Guide first shipped ad hoc,
    // outside the phase framework; registered here as part of Phase 32,
    // which is the first change to actually add one of them.
    [GUIDE_CHANNELS]: {
        owner: 'epg',
        persisted: false,
        description:
            'Live projection of the epgChannels/epgPrograms storage tables (guide-load.ts), exactly like playlist.sources projects the playlists table — never itself persisted, rebuilt at boot and after any ingest that wrote rows.',
    },
    [GUIDE_SELECTED_KEY]: {
        owner: 'epg',
        persisted: false,
        description:
            'Which programme block is selected in the Guide grid ("<channelId>|<start>"), or null — view-local UI state, reset every boot. Non-null is also what opens the programme detail modal, so closing it (button, backdrop, Escape, TV Back) is a write of null; there is deliberately no second "modal open" flag to drift out of sync with the selection.',
    },
    [GUIDE_LOADING]: {
        owner: 'epg',
        persisted: false,
        description: 'True while guide-load.ts is reading the EPG tables — transient.',
    },
    [GUIDE_OFFSET_MS]: {
        owner: 'epg',
        persisted: false,
        description:
            'How far the Guide timetable window is shifted from "now", in ms (Phase 32). 0 means it tracks the clock. Not persisted: a returning user expects the guide to open on what is on now, not on wherever they had scrolled to yesterday.',
    },

    // --- stream health (Phase 33, stone 3) ---
    // Counts only. The records themselves never reach Spektrum state: they
    // can run to thousands (one per feed ever played), and the channel list
    // reads them synchronously inside a windowed republish.
    [HEALTH_TRACKED_COUNT]: {
        owner: 'settings',
        persisted: false,
        description: 'How many feeds have accumulated playback evidence — Settings readout only, recomputed on demand from src/health/store.ts.',
    },
    [HEALTH_DEAD_COUNT]: {
        owner: 'settings',
        persisted: false,
        description: 'How many of those score below the likely-dead threshold. Advisory: such rows are marked in the list, never removed.',
    },
    [HEALTH_CLEARED]: {
        owner: 'settings',
        persisted: false,
        description: 'One-shot confirmation that the forget-stream-health button ran.',
    },

    // --- codex (Phase 34, stone 4) ---
    // Feedback only. The document itself is built on demand and handed
    // straight to a download — it is never parked in Spektrum state.
    [CODEX_STATE]: {
        owner: 'settings',
        persisted: false,
        description: "idle/busy/done/failed for the Codex export and import buttons.",
    },
    [CODEX_MESSAGE]: {
        owner: 'settings',
        persisted: false,
        description: 'Human-readable outcome of the last Codex action — claim counts on success, the specific reason on failure.',
    },
    [CODEX_AUTHOR_ID]: {
        owner: 'settings',
        persisted: false,
        description: "This device's Codex author fingerprint. Not persisted here: the keypair itself is the durable thing (codex.identity.* kv keys), and this is derived from it at boot.",
    },

    // --- codex library (Phase 37, stone 10) ---
    // The retained documents are storage-owned; only this small view model
    // and its feedback are reactive.
    [CODEX_LIBRARY_ROWS]: {
        owner: 'settings',
        persisted: false,
        description: 'Subscription list view model — one flattened row per followed Codex. Rebuilt from storage, never the source of truth.',
    },
    [CODEX_LIBRARY_STATE]: {
        owner: 'settings',
        persisted: false,
        description: 'idle/busy/done/failed for the follow, unfollow, refresh and trust actions.',
    },
    [CODEX_LIBRARY_MESSAGE]: {
        owner: 'settings',
        persisted: false,
        description: 'Human-readable outcome of the last shared-Codex action.',
    },
    [CODEX_BLOCKED_ROWS]: {
        owner: 'settings',
        persisted: false,
        description: 'Authors this device has stopped trusting, for the Settings list. The durable copy is the codex.blocked kv key.',
    },

    // --- handoff (Phase 38, stone 9) ---
    [HANDOFF_LINK]: {
        owner: 'player',
        persisted: false,
        description: 'The generated handoff address, shown so it can be read off screen where no clipboard exists. Session-only — a link outlives its usefulness within hours.',
    },
    [HANDOFF_STATE]: {
        owner: 'player',
        persisted: false,
        description: 'idle/offered/arrived/failed for the handoff panel.',
    },
    [HANDOFF_MESSAGE]: {
        owner: 'player',
        persisted: false,
        description: 'Human-readable handoff outcome — what is continuing, or exactly why it could not.',
    },

    // --- live: EPG country catalog filter (Phase 31) ---
    [SETTINGS_LIVE_EPG_VERIFIED_ONLY]: {
        owner: 'settings',
        persisted: true,
        description: 'Live view strict mode — show only channels the Phase 31 EPG country catalog matched. Off by default; a not-yet-matched channel is far more often a catalog gap than an absent channel.',
    },

    // --- ui: theme, text size and the list/grid switch live in registry-ui.ts ---

    // --- favorites: the Starred view's row source (Phase 13) ---
    [FAVORITES_ROWS]: {
        owner: 'favorites',
        persisted: false,
        description: 'The `favorites` table\'s denormalized snapshots, newest-starred first — what the Starred view renders and replays from. Written only alongside `favorites.ids` (`favorites.ts`\'s `publishFavorites()`), never persisted: the table is the source of truth.',
    },
};
