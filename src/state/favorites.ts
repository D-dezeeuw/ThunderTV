import { setValue } from 'spektrum';
import type { FavoriteRecord } from '../core/storage';
import { replace } from './typed';

/**
 * The compact favorites lookup (Feature 08.8.4) — `id -> true`, kept in
 * Spektrum state for instant O(1) row-badge derivation. A live projection of
 * the real `favorites` storage table (denormalized `FavoriteRecord` snapshots,
 * `src/core/storage/records.ts`), exactly like `playlist.sources`
 * (`src/state/playlist-load.ts`) — never itself persisted through the Phase
 * 05 bridge, rebuilt from storage at boot (`state/favorites-load.ts`) and
 * kept in sync in-process by every toggle (`state/favorites.actions.ts`).
 */
export const FAVORITES_IDS = 'favorites.ids';

/**
 * The same table's rows, newest-starred first — what the Starred view
 * renders (Phase 13). A second projection rather than a derivation of
 * `favorites.ids`, because a row needs the whole denormalized snapshot
 * (name/logo/group/streamUrl) and the ids map deliberately carries none of
 * it. Not persisted, for the same reason the ids map isn't: the table is
 * the source of truth.
 */
export const FAVORITES_ROWS = 'favorites.rows';

export type FavoriteIdsMap = Record<string, true>;

export const FAVORITES_DEFAULTS: FavoriteIdsMap = {};
export const FAVORITES_ROWS_DEFAULTS: FavoriteRecord[] = [];

export function initFavoritesState(): void {
    setValue(FAVORITES_IDS, FAVORITES_DEFAULTS);
    setValue(FAVORITES_ROWS, FAVORITES_ROWS_DEFAULTS);
}

/**
 * The single writer of both projections. They describe one storage table, so
 * writing them apart is how a star badge and a Starred row get to disagree —
 * every caller hands over the whole set and this derives the rest.
 *
 * `replace()`, not `set()`: both an unstar-shrunk ids map and a shrunk rows
 * array would otherwise merge onto the previous value and leave the removed
 * entry behind (see `typed.ts`'s own doc comment).
 */
export function publishFavorites(rows: readonly FavoriteRecord[]): void {
    const sorted = [...rows].sort((a, b) => b.addedAt - a.addedAt);
    const ids: FavoriteIdsMap = {};
    for (const row of sorted) ids[row.id] = true;
    replace(FAVORITES_IDS, ids);
    replace(FAVORITES_ROWS, sorted);
}
