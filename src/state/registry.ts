import { EPG_TICK } from './epg';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY, ZAP_HISTORY_CAP } from './player';
import { PLAYLIST_DEMO_ROWS, PLAYLIST_LAST_PICKED_LABEL, PLAYLIST_SOURCE_COUNT } from './playlist';
import { SETTINGS_PROXY_TEMPLATE } from './settings';
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
    owner: 'playlist' | 'player' | 'epg' | 'settings' | 'ui';
    persisted: boolean;
    /** Feature 05.8.5: the bulk-data guard's per-key ceiling, for keys holding an array. */
    maxItems?: number;
    /** Feature 04.9's envelope version for this key's stored shape. Every current key is at v1 — v1 is the only version that has ever existed (same finding as Phase 04's storage records) — so this defaults to 1 when omitted rather than requiring every entry to repeat it. */
    version?: number;
    description: string;
}

export const KEY_REGISTRY: Record<string, KeyMeta> = {
    // --- playlist ---
    [PLAYLIST_SOURCE_COUNT]: {
        owner: 'playlist',
        persisted: false,
        description: 'Pre-Phase-07 stub source count; superseded by real playlist.sources once import lands.',
    },
    [PLAYLIST_DEMO_ROWS]: {
        owner: 'playlist',
        persisted: false,
        description: 'Phase 02 density-preview fixture rows — never real data, never persisted.',
    },
    [PLAYLIST_LAST_PICKED_LABEL]: {
        owner: 'playlist',
        persisted: false,
        description: 'Feature 03.7.10 temporary file-picker proof; removed once Phase 07 lands.',
    },

    // --- player ---
    [PLAYER_ACTIVE]: {
        owner: 'player',
        persisted: true,
        description: 'Denormalized last-watched channel snapshot — the §6.4 instant-restore row.',
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
        description: 'Optional user-configured proxy URL template (masterplan §8) — not yet editable; Phase 22 builds the UI.',
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
