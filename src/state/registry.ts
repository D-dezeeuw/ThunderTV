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
import { PLAYER_ACTIVE, PLAYER_PLAYBACK_ERROR, PLAYER_ZAP_HISTORY, ZAP_HISTORY_CAP } from './player';
import { MAX_PLAYLIST_SOURCES, PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_DEMO_ROWS, PLAYLIST_SOURCES } from './playlist';
import { SETTINGS_PLAYBACK_ENGINE, SETTINGS_PROXY_ERROR, SETTINGS_PROXY_SAVED, SETTINGS_PROXY_TEMPLATE, SETTINGS_REFRESH_STATE } from './settings';
import {
    PLATFORM_CAPABILITIES,
    PLATFORM_NAME,
    STORAGE_TIER,
    UI_ACTIVE_VIEW,
    UI_DENSITY,
    UI_SETTINGS_OPEN,
    UI_STORAGE_NOTICE_DISMISSED,
} from './ui';

/**
 * One source of truth for every Spektrum key's persistence class and owner
 * (Feature 05.1.7) — the persistence bridge (05.3) and the generated
 * reference doc (05.9) both read this, so a key can never drift between
 * "what actually persists" and "what the docs claim persists".
 */
export interface KeyMeta {
    owner: 'playlist' | 'import' | 'player' | 'epg' | 'settings' | 'ui' | 'list' | 'favorites';
    persisted: boolean;
    /** Feature 05.8.5: the bulk-data guard's per-key ceiling, for keys holding an array. */
    maxItems?: number;
    /** Feature 04.9's envelope version for this key's stored shape. Every current key is at v1 — v1 is the only version that has ever existed (same finding as Phase 04's storage records) — so this defaults to 1 when omitted rather than requiring every entry to repeat it. */
    version?: number;
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
        description: 'Live id -> true lookup for O(1) row-badge derivation (Feature 08.8.4) — a projection of the real `favorites` storage table, rebuilt at boot and on every toggle; the table (denormalized snapshots), not this map, is the source of truth and what actually persists.',
    },

    // --- player ---
    [PLAYER_ACTIVE]: {
        owner: 'player',
        persisted: true,
        description: 'Denormalized last-watched channel snapshot — the §6.4 instant-restore row.',
    },
    [PLAYER_PLAYBACK_ERROR]: {
        owner: 'player',
        persisted: false,
        description: 'Transient diagnostics: the last fatal playback failure (hls.js fatal kind or MediaError label), rendered in the player bar — cleared on every new attach/stop.',
    },
    [PLAYER_ZAP_HISTORY]: {
        owner: 'player',
        persisted: true,
        maxItems: ZAP_HISTORY_CAP,
        description: 'Capped, deduped list of recently played channel snapshots.',
    },

    // --- epg ---
    [EPG_TICK]: {
        owner: 'epg',
        persisted: false,
        description: 'Global 30s heartbeat (masterplan §5.5) — a timestamp, recomputed every boot.',
    },

    // --- settings ---
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
    [SETTINGS_PLAYBACK_ENGINE]: {
        owner: 'settings',
        persisted: true,
        description: 'Preferred playback engine tried first (mpegts/hls/native) — Settings → Playback; each falls back to the others.',
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
};

/** `strings` (the plain-TS copy mirror, Feature 02.1) is deliberately outside this registry — it is static reference data, not application state, and is never a candidate for persistence. */
export const NON_REGISTRY_KEYS = ['strings'] as const;

export function isRegisteredKey(key: string): boolean {
    return key in KEY_REGISTRY;
}

export function isPersistedKey(key: string): boolean {
    return KEY_REGISTRY[key]?.persisted === true;
}

export function keyVersion(key: string): number {
    return KEY_REGISTRY[key]?.version ?? 1;
}

/** Every key marked `persisted: true` — the exact list Feature 05.4.2's boot rehydration `getMany`s, so adding a persisted key automatically joins boot restore. */
export function persistedKeys(): string[] {
    return Object.keys(KEY_REGISTRY).filter((key) => isPersistedKey(key));
}
