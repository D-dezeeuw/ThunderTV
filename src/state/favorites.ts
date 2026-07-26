import { setValue } from 'spektrum';

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

export type FavoriteIdsMap = Record<string, true>;

export const FAVORITES_DEFAULTS: FavoriteIdsMap = {};

export function initFavoritesState(): void {
    setValue(FAVORITES_IDS, FAVORITES_DEFAULTS);
}
