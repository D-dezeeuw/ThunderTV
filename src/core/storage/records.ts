/**
 * Per-table row shapes, shared by every tier and (later) the state layer.
 * Type-only — no imports, no implementation — so workers and `src/state/`
 * can depend on shapes without pulling in a storage implementation
 * (Feature 04.1.8).
 *
 * `channels`/`epgPrograms` rows deliberately carry no `v` (version) field —
 * they are re-parseable caches, not long-lived user data (Feature 04.9.2).
 */

export type PlaylistType = 'm3u-url' | 'm3u-file' | 'm3u-text' | 'xtream';

export interface PlaylistRecord {
    v: 1;
    id: string;
    type: PlaylistType;
    name: string;
    url?: string;
    username?: string;
    password?: string;
    channelCount: number;
    lastRefresh: number | null;
    etag: string | null;
    lastModified: string | null;
}

/** A channel's DRM configuration, extracted from `#KODIPROP` lines (Phase 06 `kodiprop.utils.ts`). */
export interface ChannelDrm {
    /** Normalized license type, e.g. `clearkey` or `com.widevine.alpha`. */
    licenseType: string;
    /** True only for ClearKey entries with at least one successfully parsed key. */
    supported: boolean;
    clearKeys?: ChannelDrmClearKeys;
}

export interface ChannelDrmClearKeys {
    /** Key id (32 lowercase hex chars) mapped to its key (32 lowercase hex chars). */
    [kidHex: string]: string;
}

export interface ChannelRecord {
    playlistId: string;
    index: number;
    name: string;
    url: string;
    logo: string | null;
    group: string | null;
    tvgId: string | null;
    radio: boolean;
    drm?: ChannelDrm;
}

export interface GroupRecord {
    playlistId: string;
    name: string;
    channelCount: number;
    firstIndex: number;
}

export interface EpgChannelRecord {
    id: string;
    displayName: string;
    icon: string | null;
}

export interface EpgProgramRecord {
    channelId: string;
    start: number;
    stop: number;
    title: string;
    description: string | null;
}

/** Denormalized snapshot (Feature 04.5.7) — playable without the source playlist loaded. */
export interface FavoriteRecord {
    v: 1;
    id: string;
    name: string;
    streamUrl: string;
    logo: string | null;
    group: string | null;
}

/** Same denormalized shape as favorites, capped to the most recent 100 by the state layer (Phase 05). */
export interface RecentRecord {
    v: 1;
    id: string;
    name: string;
    streamUrl: string;
    logo: string | null;
    group: string | null;
    playedAt: number;
}

/**
 * Bulk-op-capable tables (Feature 04.1.3/04.1.7). `settings` is
 * deliberately **not** included here — small keyed values (including
 * individual settings) go through the plain `get`/`set`/`getMany`/`setMany`
 * methods instead of table ops; mixing the two is a review reject.
 */
export type TableName =
    'playlists' | 'channels' | 'groups' | 'epgChannels' | 'epgPrograms' | 'favorites' | 'recent';

export interface TableRowMap {
    playlists: PlaylistRecord;
    channels: ChannelRecord;
    groups: GroupRecord;
    epgChannels: EpgChannelRecord;
    epgPrograms: EpgProgramRecord;
    favorites: FavoriteRecord;
    recent: RecentRecord;
}
