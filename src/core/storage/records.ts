/**
 * Per-table row shapes, shared by every tier and (later) the state layer.
 * Type-only — no imports, no implementation — so workers and `src/state/`
 * can depend on shapes without pulling in a storage implementation
 * (Feature 04.1.8).
 *
 * `channels`/`epgPrograms` rows deliberately carry no `v` (version) field —
 * they are re-parseable caches, not long-lived user data (Feature 04.9.2).
 *
 * `PlaylistRecord` deliberately has no `needsReupload` field (Feature
 * 07.2.6/07.3.7): whether a `m3u-file`/`m3u-text` source's rows survived a
 * reload depends on the *current* storage tier, which can change between
 * boots (a demotion). Persisting that fact would let it go stale exactly
 * like a persisted `storage.tier` would (Phase 04's own reasoning) — it's
 * computed fresh from `channelCount` vs. the live `channels` row count for
 * that playlist id whenever `playlist.sources` is built
 * (`src/state/playlist-load.ts`).
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
    /** Group count including the `Ungrouped` bucket (Phase 06 `GroupMeta[]`). */
    groupCount: number;
    radioCount: number;
    drmCount: number;
    /** Unparseable/URL-less entries the Phase 06 tolerance policy dropped (Feature 06.7.2). */
    skipped: number;
    /** Set once, at creation — never touched by a re-import upsert (Feature 07.7.7). */
    importDate: number;
    lastRefresh: number | null;
    etag: string | null;
    lastModified: string | null;
    /**
     * A `m3u-file`/`m3u-text` source's cheap content fingerprint (Feature
     * 07.7.6) — `null` for `m3u-url`/`xtream`, which key on
     * `makeSourceKey()` instead. Compared against a new file/paste
     * import's own fingerprint to warn "this looks identical to
     * &lt;name&gt;" rather than silently deduping.
     */
    contentFingerprint: string | null;
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

/**
 * Denormalized snapshot (Feature 04.5.7, shape finalized by Feature 08.8.3
 * per masterplan §5/§9) — playable and renderable without the source
 * playlist loaded. `sourceId` lets a favorite be traced back to (and
 * re-resolved against) its origin playlist; `addedAt` orders the Favorites
 * view without a second lookup.
 */
export interface FavoriteRecord {
    v: 1;
    id: string;
    name: string;
    streamUrl: string;
    logo: string | null;
    group: string | null;
    sourceId: string;
    addedAt: number;
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
