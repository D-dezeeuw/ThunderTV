import { getPlatform } from '../core/platform';
import { publishFavorites } from './favorites';

/**
 * Builds `favorites.ids`/`favorites.rows` from the real `favorites` storage
 * table (Feature 08.8.4/08.8.10) — called once at boot, mirroring
 * `state/playlist-load.ts`'s `loadPlaylistSources()`. Runs on every tier:
 * `favorites` is in `LocalStorageStorage`'s `PERSISTED_TABLES`, so this
 * reflects real survived data even on the partial tier.
 */
export async function loadFavorites(): Promise<void> {
    publishFavorites(await getPlatform().storage.getAll('favorites'));
}
