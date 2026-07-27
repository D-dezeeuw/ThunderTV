import type { ChannelDrm } from '../core/storage';

export type { ChannelDrm, ChannelDrmClearKeys } from '../core/storage';

/**
 * A flat, storage-ready channel row (Feature 06.5.1) — no nested `tvg`/
 * `group` wrappers, no retained `raw` M3U text, so a 90k-row array stays a
 * few MB of plain memory (`src/m3u/channel-memory.ts`'s `allRows`) instead
 * of a deep object tree. Field-for-field identical to
 * `src/core/storage/records.ts`'s `ChannelRecord` minus the storage key
 * (`playlistId`/`index`, added at write time) — the mapper's output is
 * exactly what `parser-client.ts` bulk-puts into the `channels` store, with
 * no translation step in between.
 */
export interface ChannelRow {
    /** Minted once at parse time (`crypto.randomUUID()`) — stable across a session for favorites/recent lookups (Feature 06.5.3). */
    id: string;
    name: string;
    url: string;
    group: string | null;
    logo: string | null;
    tvgId: string | null;
    /**
     * Normalized at parse time — every downstream consumer sees a real
     * boolean, never the raw M3U attribute's on/off string (Feature 06.9.2).
     * Consumed by: the Phase 08 row template (radio glyph instead of the
     * usual thumbnail), Phase 16-17's EPG matching (radio channels never
     * have programs), and Phase 10-12's player (inline-audio layout).
     */
    radio: boolean;
    drm?: ChannelDrm;
    /**
     * Quality/provider/catch-up alternatives of the same channel, attached
     * by `src/channels/grouping.ts` when the list is showing grouped
     * channels. Absent on raw (ungrouped) rows.
     */
    variants?: ChannelVariant[];
}

/** One playable alternative of a grouped channel — see `src/channels/grouping.ts`. */
export interface ChannelVariant {
    id: string;
    url: string;
    label: string;
    quality: string | null;
    isRecording: boolean;
    provider: string | null;
}

/**
 * Group metadata computed once per parse pass (Feature 06.6.1) — `firstIndex`
 * is a row position in the full channel array, so jumping to a group from
 * the Phase 08 group view is a multiplication (`firstIndex * ROW_H`), never
 * a 90k-row scan.
 */
export interface GroupMeta {
    name: string;
    count: number;
    firstIndex: number;
}

/** The pseudo-group name for rows with a missing/blank `group-title` (Feature 06.6.3). */
export const UNGROUPED = 'Ungrouped';

/**
 * Deterministic, reload-stable channel identity (Feature 08.10's
 * requirement that selection/favorites survive a reload). A channel's real
 * identity is its position in its playlist's parse — `ChannelRecord`
 * (`src/core/storage/records.ts`) carries no separate `id` field; this
 * formula computes it identically whether a row was just parsed
 * (`parser-client.ts` overwrites `mapItemToChannelRow()`'s temporary
 * `crypto.randomUUID()` with this once the row's real index is known) or
 * reconstructed from storage on load (`src/state/list-load.ts`).
 */
export function makeChannelRowId(playlistId: string, index: number): string {
    return `${playlistId}:${String(index)}`;
}

/** Distinct-group ceiling (Feature 06.6.7) — overflow group rows fold into `UNGROUPED` so the Phase 08 UI can trust the bound on a pathological playlist. */
export const MAX_GROUPS = 10_000;
