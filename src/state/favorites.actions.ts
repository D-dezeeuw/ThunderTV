import { defineFn } from 'spektrum';
import type { FavoriteRecord } from '../core/storage';
import { getPlatform } from '../core/platform';
import { findRowById } from '../ui/virtual-list';
import { FAVORITES_IDS, FAVORITES_ROWS, publishFavorites, type FavoriteIdsMap } from './favorites';
import { publishVariantsFor } from './live.actions';
import { setActiveChannel } from './player.actions';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import type { ActiveChannelSnapshot } from './records';
import { viewForSnapshot } from './recent.actions';
import { get } from './typed';

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
    const rows = get<FavoriteRecord[]>(FAVORITES_ROWS) ?? [];

    if (ids[id]) {
        await storage.deleteRow('favorites', id);
        publishFavorites(rows.filter((row) => row.id !== id));
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
        ...(row.radio ? { radio: true } : {}),
    };
    await storage.bulkPut('favorites', [record], (r) => r.id);
    publishFavorites([record, ...rows.filter((existing) => existing.id !== id)]);
}

/**
 * The Starred view's one delegated handler. Spektrum allows a single
 * `data-action`/`data-fn` pair per element, and a starred row has two
 * controls (replay, unstar) — so the whole list binds once and the click
 * target decides which it was, the same delegation `recent.actions.ts`
 * uses for `recent/play`.
 */
export function registerFavoritesActions(): void {
    defineFn('favorites/row', (el, _state, _delta, _value, event) => {
        const target = event?.target as HTMLElement | undefined;
        const id = (target?.closest<HTMLElement>('[data-id]') ?? el).dataset['id'];
        if (!id) return;
        if (target?.closest('[data-favorite-unstar]')) {
            void toggleFavoriteById(id);
            return;
        }
        playFavorite(id);
    });
}

/**
 * Plays a starred channel from its snapshot alone — no playlist loaded, no
 * lookup against the channel list, exactly like `playFromHistory()`. A
 * favorite that only played while its source happened to be open would
 * defeat the point of storing the denormalized row.
 */
export function playFavorite(id: string): void {
    const row = (get<FavoriteRecord[]>(FAVORITES_ROWS) ?? []).find((entry) => entry.id === id);
    if (!row) return;

    const snapshot: ActiveChannelSnapshot = {
        id: row.id,
        sourceId: row.sourceId,
        name: row.name,
        streamUrl: row.streamUrl,
        logo: row.logo,
        group: row.group,
        ...(row.radio === true ? { radio: true } : {}),
    };
    publishVariantsFor(snapshot.id, snapshot.streamUrl);
    setActiveChannel(snapshot);
    // Navigating last, same as Recents: the router owns `ui.activeView`, and
    // the view it lands on already has the channel playing when it paints.
    location.hash = `#/${viewForSnapshot(snapshot)}`;
}
