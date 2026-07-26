import { getPlatform } from '../core/platform';
import { FAVORITES_IDS, type FavoriteIdsMap } from './favorites';
import { set } from './typed';

/**
 * Builds `favorites.ids` from the real `favorites` storage table (Feature
 * 08.8.4/08.8.10) — called once at boot, mirroring
 * `state/playlist-load.ts`'s `loadPlaylistSources()`. Runs on every tier:
 * `favorites` is in `LocalStorageStorage`'s `PERSISTED_TABLES`, so this
 * reflects real survived data even on the partial tier.
 */
export async function loadFavoriteIds(): Promise<void> {
    const rows = await getPlatform().storage.getAll('favorites');
    const ids: FavoriteIdsMap = {};
    for (const row of rows) ids[row.id] = true;
    set(FAVORITES_IDS, ids);
}
