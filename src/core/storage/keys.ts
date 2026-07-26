/**
 * Shared key encoding (Feature 04.3.2) — the single place that decides how a
 * composite key sorts, so `MemoryStorage`'s and `LocalStorageStorage`'s
 * string-keyed maps and `IdbStorage`'s native array keys can never disagree
 * about ordering.
 */

/** A single-string key (`playlists`/`epgChannels`/`favorites`/`recent`) or a composite tuple (`channels`/`groups`/`epgPrograms`). */
export type StorageKey = string | (string | number)[];

/** Numbers are zero-padded to 15 digits so lexicographic string comparison matches numeric comparison up to ~10^15 (comfortably past any epoch-millisecond timestamp). */
const NUMERIC_PAD_WIDTH = 15;
/** A plain, ordinary separator by design — a genuinely unambiguous one (e.g. a null character) would make this a binary-looking source file. Playlist/channel ids in this codebase never contain a pipe; a real-world one that did would only risk a rare key-collision in range-query ordering, not data loss (every table's actual identity is the full row, never just the encoded key). */
const KEY_PART_SEPARATOR = '|';

export function encodeKey(key: StorageKey): string {
    if (typeof key === 'string') return key;
    return key.map(encodeKeyPart).join(KEY_PART_SEPARATOR);
}

/** The encoded-key prefix every row for `playlistId` starts with in a composite-keyed table (`channels`/`groups`) — shared by `MemoryStorage`/`LocalStorageStorage`'s `deleteByPlaylistId` (Feature 07.9.3) so the separator stays defined in exactly one place. */
export function playlistIdKeyPrefix(playlistId: string): string {
    return `${playlistId}${KEY_PART_SEPARATOR}`;
}

function encodeKeyPart(part: string | number): string {
    if (typeof part === 'string') return part;
    if (part < 0) {
        throw new Error(`encodeKey: negative numeric key parts are not supported (got ${String(part)})`);
    }
    return String(part).padStart(NUMERIC_PAD_WIDTH, '0');
}
