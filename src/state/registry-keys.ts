import { EPG_TICK } from './epg';
import { FAVORITES_IDS } from './favorites';
import {
    IMPORT_ERROR_KIND,
    IMPORT_ERROR_MESSAGE,
    IMPORT_PARSED,
    IMPORT_SOURCE_NAME,
    IMPORT_STATE,
    IMPORT_SUMMARY,
    IMPORT_WRITTEN,
} from './import';
import { LIST_PAD_BOTTOM, LIST_PAD_TOP, LIST_SELECTED_ID, LIST_VISIBLE_ROWS } from './list';
import { GROUPS_PANEL_CAP, LIST_GROUPS, LIST_GROUPS_TRUNCATED } from './list-groups';
import { UI_ACTIVE_GROUP, UI_LIST_STATE, UI_VIEW_MODE } from './list-state';
import {
    PLAYER_ACTIVE,
    PLAYER_ACTIVE_VARIANT_ID,
    PLAYER_VARIANTS,
    PLAYER_VISUALIZER_PAUSED,
    PLAYER_VISUALIZER_PRESET,
    PLAYER_ZAP_HISTORY,
    VARIANTS_CAP,
    ZAP_HISTORY_CAP,
} from './player';
import { MAX_PLAYLIST_SOURCES, PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_DEMO_ROWS, PLAYLIST_SOURCES } from './playlist';
import { LIVE_STATS } from './live';
import {
    SETTINGS_BUFFERING,
    SETTINGS_EXPORT_STATE,
    SETTINGS_LIVE_COUNTRY,
    SETTINGS_LIVE_DROP_JUNK,
    SETTINGS_LIVE_KNOWN_ONLY,
    SETTINGS_LOCALE,
    SETTINGS_NAV_CATEGORIES,
    SETTINGS_NAV_GUIDE,
    SETTINGS_NAV_RADIO,
    SETTINGS_NAV_RECENTS,
    SETTINGS_NAV_SOURCES,
    SETTINGS_NAV_STARRED,
    SETTINGS_PLAYBACK_ENGINE,
    SETTINGS_PROXY_ERROR,
    SETTINGS_PROXY_SAVED,
    SETTINGS_PROXY_TEMPLATE,
    SETTINGS_REFRESH_STATE,
} from './settings';
import {
    PLATFORM_CAPABILITIES,
    PLATFORM_NAME,
    STORAGE_TIER,
    UI_ACTIVE_VIEW,
    UI_DENSITY,
    UI_SETTINGS_OPEN,
    UI_STORAGE_NOTICE_DISMISSED,
} from './ui';
import { UI_SETUP_COMPLETE, UI_WIZARD_OPEN, UI_WIZARD_STEP } from './wizard';
import { OVERFLOW_REGISTRY_ENTRIES } from './registry-overflow';
import { PLAYER_REGISTRY_ENTRIES } from './registry-player';
/**
 * One source of truth for every Spektrum key's persistence class and owner
 * (Feature 05.1.7) — the persistence bridge (05.3) and the generated
 * reference doc (05.9) both read this, so a key can never drift between
 * "what actually persists" and "what the docs claim persists".
 */
export interface KeyMeta {
    owner:
        | 'playlist'
        | 'import'
        | 'player'
        | 'epg'
        | 'settings'
        | 'ui'
        | 'list'
        | 'favorites'
        | 'vod'
        | 'series'
        | 'search'
        | 'downloads';
    persisted: boolean;
    /** Feature 05.8.5: the bulk-data guard's per-key ceiling, for keys holding an array. */
    maxItems?: number;
    /** Feature 04.9's envelope version for this key's stored shape. Every current key is at v1 — v1 is the only version that has ever existed (same finding as Phase 04's storage records) — so this defaults to 1 when omitted rather than requiring every entry to repeat it. */
    version?: number;
    /** UPGRADES U11: a later write to this key can be a strict subset of an earlier one, so Spektrum's deep merge would leave the dropped fields behind — `typed.ts`'s `replace()` is the only correct write, and `set()` throws in dev. Marked by hand (only the owner knows whether a subset write is possible) and mirrored in `map-shaped-keys.ts`, which is what the write path actually reads; `map-shaped-keys.spec.ts` gates the two against drift. */
    mapShaped?: boolean;
    description: string;
}
export const KEY_REGISTRY: Record<string, KeyMeta> = {
    // --- playlist ---
    [PLAYLIST_SOURCES]: {
        owner: 'playlist',
        persisted: false,
        maxItems: MAX_PLAYLIST_SOURCES,
        description: 'Live projection of the playlists storage table (Feature 07.1.8) — never itself persisted; rebuilt from storage at boot and after every import commit, so there is exactly one source of truth.',
    },
    [PLAYLIST_ACTIVE_SOURCE_ID]: {
        owner: 'playlist',
        persisted: true,
        description: 'The source the user last navigated into (Feature 05.6.2, persisted starting Feature 08.10.6) — a reload lands back in the same channel list instead of a source picker, matching Feature 08.6\'s "never left" framing.',
    },
    [PLAYLIST_DEMO_ROWS]: {
        owner: 'playlist',
        persisted: false,
        description: 'Phase 02 density-preview fixture rows — never real data, never persisted.',
    },

    // --- import (Feature 07.5.1) ---
    [IMPORT_STATE]: {
        owner: 'import',
        persisted: false,
        description: 'Current import pipeline stage (idle/fetching/reading/parsing/writing/done/error) — transient, reset to idle on every boot.',
    },
    [IMPORT_PARSED]: {
        owner: 'import',
        persisted: false,
        description: 'Rows parsed so far in the in-flight import — a scalar counter, never the rows themselves (§5.8).',
    },
    [IMPORT_WRITTEN]: {
        owner: 'import',
        persisted: false,
        description: 'Rows durably written to storage so far in the in-flight import.',
    },
    [IMPORT_SOURCE_NAME]: {
        owner: 'import',
        persisted: false,
        description: 'Display name of the in-flight import\'s source (filename/URL/"Pasted playlist"), for the stage label.',
    },
    [IMPORT_ERROR_KIND]: {
        owner: 'import',
        persisted: false,
        description: 'Classified failure kind of the last import attempt (Feature 07.4/07.7.6) — drives which retry affordance the UI offers.',
    },
    [IMPORT_ERROR_MESSAGE]: {
        owner: 'import',
        persisted: false,
        description: 'Human-readable message for the last import failure.',
    },
    [IMPORT_SUMMARY]: {
        owner: 'import',
        persisted: false,
        description: 'Result panel data for the most recently completed import (Feature 07.6) — cleared on navigation away.',
    },

    // --- list (Feature 08.1/08.2/08.7) ---
    [LIST_VISIBLE_ROWS]: {
        owner: 'list',
        persisted: false,
        maxItems: 128,
        description: 'The virtual-list windowed slice (masterplan §5.4) — published by src/ui/virtual-list.ts on every scroll-driven republish; ≤ ~40 rows by construction (overscan included), never the full playlist array.',
    },
    [LIST_PAD_TOP]: {
        owner: 'list',
        persisted: false,
        description: 'Top spacer height (px) so the native scrollbar reflects the full virtual extent above the published window.',
    },
    [LIST_PAD_BOTTOM]: {
        owner: 'list',
        persisted: false,
        description: 'Bottom spacer height (px) — same role as padTop, below the published window.',
    },
    [LIST_SELECTED_ID]: {
        owner: 'list',
        persisted: false,
        description: 'The keyboard/click selection cursor (Feature 08.7.2) — distinct from player.active. Saved per source into ui.listState (Feature 08.7.8); this live key itself is not directly persisted.',
    },
    [LIST_GROUPS]: {
        owner: 'list',
        persisted: false,
        maxItems: GROUPS_PANEL_CAP,
        description: 'The groups panel\'s own row set (Feature 08.5.1) — built once per source entry from the `groups` storage table, capped independently of Phase 06\'s MAX_GROUPS=10000 extraction cap so the panel\'s own DOM cost stays bounded (Feature 08.5.9).',
    },
    [LIST_GROUPS_TRUNCATED]: {
        owner: 'list',
        persisted: false,
        description: 'True when the groups panel dropped groups past GROUPS_PANEL_CAP — drives the "too many groups to list" note.',
    },

    // --- ui: per-source list state (Feature 08.6) ---
    [UI_LIST_STATE]: {
        owner: 'ui',
        persisted: true,
        mapShaped: true,
        description: 'Per-source list UI state map (scrollTop, groupScrollTop, viewMode, activeGroup, selectedId), LRU-capped to the last 20 touched sources (Feature 08.6.1/08.6.7) — what makes returning to a playlist feel like never having left.',
    },
    [UI_ACTIVE_GROUP]: {
        owner: 'ui',
        persisted: false,
        description: 'The currently-open source\'s active group filter, if any (Feature 08.5.7) — restored from ui.listState on source entry, written live on every group toggle.',
    },
    [UI_VIEW_MODE]: {
        owner: 'ui',
        persisted: false,
        description: '"all" | "groups" — the currently-open source\'s list view mode (Feature 08.5.5/08.6.1), same restore-on-entry pattern as ui.activeGroup.',
    },

    // --- favorites (Feature 08.8) ---
    [FAVORITES_IDS]: {
        owner: 'favorites',
        persisted: false,
        mapShaped: true,
        description: 'Live id -> true lookup for O(1) row-badge derivation (Feature 08.8.4) — a projection of the real `favorites` storage table, rebuilt at boot and on every toggle; the table (denormalized snapshots), not this map, is the source of truth and what actually persists.',
    },
    // --- player ---
    [PLAYER_ACTIVE]: {
        owner: 'player',
        persisted: true,
        mapShaped: true,
        description: 'Denormalized last-watched channel snapshot — the §6.4 instant-restore row. Written via replace(): its optional kind/radio/series fields are set by only some writers, so a deep-merged write leaves the previous item\'s fields on the new one (a movie started after an episode inherited the episode\'s series coordinates).',
    },
    [PLAYER_VARIANTS]: {
        owner: 'player',
        persisted: false,
        maxItems: VARIANTS_CAP,
        description: 'The playing channel\'s alternate feeds (other qualities, a provider bundle\'s copy, catch-up) — rebuilt from the loaded catalog on every channel change, so never persisted: a stale copy would offer stream ids the provider may already have rotated.',
    },
    [PLAYER_ACTIVE_VARIANT_ID]: {
        owner: 'player',
        persisted: false,
        description: 'Which variant is currently playing, so the dock strip can mark one chip active. Derived alongside player.variants.',
    },
    [PLAYER_ZAP_HISTORY]: {
        owner: 'player',
        persisted: true,
        maxItems: ZAP_HISTORY_CAP,
        description: 'Capped, deduped list of recently played channel snapshots.',
    },
    [PLAYER_VISUALIZER_PRESET]: {
        owner: 'player',
        persisted: true,
        description: 'Radio visualizer preference — \'auto\' (cycle every preset) or a specific preset id (a genre preset stays pinned). Chosen by the listener, never inferred from the audio.',
    },
    [PLAYER_VISUALIZER_PAUSED]: {
        owner: 'player',
        persisted: false,
        description: 'Whether the listener paused the Radio visualizer render loop — transient, always false on a fresh Radio visit.',
    },
    // --- epg ---
    [EPG_TICK]: {
        owner: 'epg',
        persisted: false,
        description: 'Global 30s heartbeat (masterplan §5.5) — a timestamp, recomputed every boot.',
    },

    // --- settings ---
    [SETTINGS_LOCALE]: {
        owner: 'settings',
        persisted: true,
        description: 'UI language (en/nl/de) — Settings → User, switchable live; drives both the `strings` state mirror and the plain-TS `strings` singleton (src/app/strings.ts).',
    },
    [SETTINGS_PROXY_TEMPLATE]: {
        owner: 'settings',
        persisted: true,
        description: 'Optional user-configured proxy URL template (masterplan §8) — editable via Settings → Streaming (Feature 07.8.1); Phase 22 builds out the rest of that section.',
    },
    [SETTINGS_PROXY_ERROR]: {
        owner: 'settings',
        persisted: false,
        description: 'Inline validation message for the last proxy-template save attempt (Feature 07.8.3) — transient, cleared on next edit.',
    },
    [SETTINGS_PROXY_SAVED]: {
        owner: 'settings',
        persisted: false,
        description: 'True immediately after a successful proxy-template save (Feature 07.8.3) — transient, cleared on next edit.',
    },
    [SETTINGS_REFRESH_STATE]: {
        owner: 'settings',
        persisted: false,
        description: 'Feedback for the manual channel-list refresh button (idle/busy/done/failed) — transient, reset on each attempt.',
    },
    [SETTINGS_EXPORT_STATE]: {
        owner: 'settings',
        persisted: false,
        description: 'Feedback for the Settings configuration export (idle/done/failed) — transient, reset on each attempt.',
    },
    [SETTINGS_PLAYBACK_ENGINE]: {
        owner: 'settings',
        persisted: true,
        description: 'Preferred playback engine tried first (mpegts/hls/native) — Settings → Playback; each falls back to the others.',
    },
    [SETTINGS_BUFFERING]: {
        owner: 'settings',
        persisted: true,
        description: 'MPEG-TS buffering mode — auto (default, adapts to measured stalls), smooth (fixed deep buffer), or lowLatency.',
    },
    [SETTINGS_NAV_SOURCES]: {
        owner: 'settings',
        persisted: true,
        description: 'Show the Sources button in the nav rail. Default on — hiding it on a fresh install would bury the import flow.',
    },
    [SETTINGS_NAV_CATEGORIES]: {
        owner: 'settings',
        persisted: true,
        description: 'Show the Categories button in the nav rail — the provider\'s catalog exactly as shipped, unfiltered and ungrouped.',
    },
    [SETTINGS_NAV_RADIO]: {
        owner: 'settings',
        persisted: true,
        description: 'Show the Radio button in the nav rail — audio-only stations, grouped separately from TV.',
    },
    [SETTINGS_NAV_STARRED]: {
        owner: 'settings',
        persisted: true,
        description: 'Show the Starred button in the nav rail.',
    },
    [SETTINGS_NAV_RECENTS]: {
        owner: 'settings',
        persisted: true,
        description: 'Show the Recents button in the nav rail.',
    },
    [SETTINGS_NAV_GUIDE]: {
        owner: 'settings',
        persisted: true,
        description: 'Show the Guide button in the nav rail.',
    },
    [SETTINGS_LIVE_COUNTRY]: {
        owner: 'settings',
        persisted: true,
        description: 'Country token the Live view keeps, matched against the "| NL |"-style prefix providers put on channels and categories. Empty string disables country filtering.',
    },
    [SETTINGS_LIVE_KNOWN_ONLY]: {
        owner: 'settings',
        persisted: true,
        description: 'Live view strict mode — show only channels the curated catalog knows. Off by default; a whitelist silently hides legitimate regional and newly launched channels.',
    },
    [SETTINGS_LIVE_DROP_JUNK]: {
        owner: 'settings',
        persisted: true,
        description: 'Drop event-slot placeholders (VIAPLAY 07 and friends), separator rows and adult entries from the Live view. On by default.',
    },
    // SETTINGS_LIVE_EPG_VERIFIED_ONLY is registered in registry-overflow.ts
    // (this file is at the 400-line hard cap — see that file's header).

    // --- live ---
    [LIVE_STATS]: {
        owner: 'list',
        persisted: false,
        description: 'Live-view filter readout (rows in, channels kept, how many hidden and why) — derived from the loaded catalog on every rebuild, so never persisted. Exists so a user who thinks a channel is missing can see that the list filtered rather than that the provider did.',
    },

    // --- ui (including the diagnostic mirrors documented as ui-owned — see state/README.md) ---
    [UI_ACTIVE_VIEW]: {
        owner: 'ui',
        persisted: false,
        description: 'Current route — driven by the URL hash, which is its own persistence mechanism.',
    },
    [UI_DENSITY]: {
        owner: 'ui',
        persisted: true,
        description: 'Channel-list row density preference.',
    },
    [UI_SETTINGS_OPEN]: {
        owner: 'ui',
        persisted: false,
        description: 'Transient settings-panel open/closed state — reopening automatically on boot would be surprising.',
    },
    [UI_STORAGE_NOTICE_DISMISSED]: {
        owner: 'ui',
        persisted: true,
        description: 'Storage-mode notice dismissal (Feature 04.8.5) — persists on tiers that can keep it, session-only on none by construction.',
    },
    [PLATFORM_NAME]: {
        owner: 'ui',
        persisted: false,
        description: 'Diagnostics only (Feature 03.8.6) — recomputed fresh from real detection every boot.',
    },
    [PLATFORM_CAPABILITIES]: {
        owner: 'ui',
        persisted: false,
        description: 'Live-derived from storage.tier every boot (Feature 04.7.5) — never meaningfully cacheable.',
    },
    [STORAGE_TIER]: {
        owner: 'ui',
        persisted: false,
        description: 'Set from the real boot-time probe (Phase 04) every session — persisting a stale tier would be actively wrong.',
    },
    // --- ui: first-run setup wizard ---
    [UI_WIZARD_OPEN]: {
        owner: 'ui',
        persisted: false,
        description: 'First-run setup wizard open/closed — computed fresh every boot from whether playlist.sources is empty once the real load finishes (wizard.actions.ts\'s openWizardIfNoSources()), same "never auto-reopen a stale value" reasoning as ui.settingsOpen. Can also be reopened manually (wizard/open, Settings → Streaming).',
    },
    [UI_WIZARD_STEP]: {
        owner: 'ui',
        persisted: false,
        description: 'Which of the wizard\'s two steps (1 = language/country, 2 = Xtream credentials) is showing — reset to 1 every time the wizard opens.',
    },
    [UI_SETUP_COMPLETE]: {
        owner: 'ui',
        persisted: true,
        description: 'Whether first-run setup has already been dealt with on this install (saved, skipped, or a source found at boot) — the one wizard key that must survive a reload, since it is what stops a configured user from being asked again (wizard.actions.ts\'s markSetupComplete()).',
    },
    ...OVERFLOW_REGISTRY_ENTRIES,
    ...PLAYER_REGISTRY_ENTRIES,
};
