import type { DBSchema } from 'idb';
import type {
    ChannelRecord,
    EpgChannelRecord,
    EpgProgramRecord,
    FavoriteRecord,
    GroupRecord,
    PlaylistRecord,
    RecentRecord,
} from './records';

export const DB_NAME = 'thundertv';
export const DB_VERSION = 1;

/**
 * Backs the plain `get`/`set`/`getMany`/`setMany` kv methods — Feature
 * 04.1.7's "small keyed snapshots" surface, kept separate from the seven
 * bulk tables below (Feature 04.1.3).
 */
export const SETTINGS_STORE = 'settings';

/**
 * Every bulk table uses out-of-line keys (the caller's `keyOf` function
 * supplies the key explicitly on `put`) rather than an inline `keyPath` —
 * row shapes stay decoupled from their storage key. `channels`/`groups`/
 * `epgPrograms` use composite `[string, ...]` primary keys, which IDB can
 * range-query directly via `IDBKeyRange.bound()` — no secondary index is
 * needed for the `epgPrograms` `[channelId, start]` range query the plan's
 * §4.4.5 asks for; the primary key already is that index (Feature 04.4.5).
 */
export interface ThunderTvDb extends DBSchema {
    playlists: { key: string; value: PlaylistRecord };
    channels: { key: [playlistId: string, index: number]; value: ChannelRecord };
    groups: { key: [playlistId: string, name: string]; value: GroupRecord };
    epgChannels: { key: string; value: EpgChannelRecord };
    epgPrograms: { key: [channelId: string, start: number]; value: EpgProgramRecord };
    favorites: { key: string; value: FavoriteRecord };
    recent: { key: string; value: RecentRecord };
    [SETTINGS_STORE]: { key: string; value: unknown };
}

export const BULK_STORE_NAMES = [
    'playlists',
    'channels',
    'groups',
    'epgChannels',
    'epgPrograms',
    'favorites',
    'recent',
] as const;
