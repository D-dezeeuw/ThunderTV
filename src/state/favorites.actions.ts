import type { FavoriteRecord } from '../core/storage';
import { getPlatform } from '../core/platform';
import { findRowById } from '../ui/virtual-list';
import { FAVORITES_IDS, type FavoriteIdsMap } from './favorites';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get, replace, set } from './typed';

/**
 * The favorite toggle (Feature 08.8) — the first write path into the
 * denormalized favorites snapshots Phase 13 builds views on. Idempotent and
 * race-safe (Feature 08.8.8): re-reads the live `favorites.ids` map on every
 * call rather than trusting a caller-held boolean, so a double-fire (e.g. a
 * long-press immediately followed by a stray native `contextmenu`) still
 * lands as exactly one state change — toggle, then toggle-back, never a
 * double-add or a double-remove artifact.
 */
export async function toggleFavoriteById(id: string): Promise<void> {
    const storage = getPlatform().storage;
    const ids = get<FavoriteIdsMap>(FAVORITES_IDS) ?? {};

    if (ids[id]) {
        await storage.deleteRow('favorites', id);
        const next = { ...ids };
        delete next[id];
        // replace(), not set() — see typed.ts's own doc comment for why a
        // shrunk object needs a true replace, not a merge-onto-existing set().
        replace(FAVORITES_IDS, next);
        return;
    }

    const row = findRowById(id);
    const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
    if (!row || !sourceId) return;

    const record: FavoriteRecord = {
        v: 1,
        id: row.id,
        name: row.name,
        streamUrl: row.url,
        logo: row.logo,
        group: row.group,
        sourceId,
        addedAt: Date.now(),
    };
    await storage.bulkPut('favorites', [record], (r) => r.id);
    set(FAVORITES_IDS, { ...ids, [id]: true });
}
