import { computed, type State } from 'spektrum';
import { getRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { EPG_TICK } from './epg';
import { epgChannelIdForRow, hasEpgPrograms, rowEpgSnapshot } from './epg-index';
import { FAVORITES_ROWS } from './favorites';
import { liveDisplayRows } from './live-rows';
import { PLAYER_ZAP_HISTORY } from './player';

/**
 * What is on now, per row id — the Starred and Recents views' EPG line.
 *
 * A map rather than enriched row arrays, and read from the markup as
 * `epg.nowByRow[item.id]`, for two reasons. It joins by channel id, so a row
 * can only ever show its own programme (`list-publish.ts`'s header has the
 * `data-each` binding rule this exists to respect). And it leaves
 * `favorites.rows`/`player.zapHistory` untouched, so the 30s heartbeat
 * refreshes the *line* without republishing the row arrays — which for these
 * two keyless lists would mean destroying and rebuilding every row, twice a
 * minute, under whatever the viewer had focused. No per-row timers: the one
 * global `epg.tick` beat drives this, exactly like the channel list's window.
 *
 * Neither a `FavoriteRecord` nor an `ActiveChannelSnapshot` carries a
 * `tvgId`/`epgId` — they are denormalized play-me-anyway snapshots — so the
 * guide id has to come from the channel row wearing the same id. An entry
 * whose channel is not in memory, or whose channel the catalog never
 * matched, or that has nothing on air right now, is simply absent from the
 * map: the row renders no line, never a guess.
 */
export const EPG_NOW_BY_ROW = 'epg.nowByRow';

export function registerEpgRowSelectors(): void {
    // A `computed()` assigns its whole value rather than merging it (unlike
    // `setValue`), so entries genuinely disappear when their row does — the
    // `replace()` dance a map-shaped *key* would need does not apply here.
    computed(EPG_NOW_BY_ROW, [FAVORITES_ROWS, PLAYER_ZAP_HISTORY, EPG_TICK], (state: State) =>
        nowLinesFor(rowIdsOf(state), Date.now()),
    );
}

interface EpgRowsState {
    favorites?: { rows?: readonly { id?: string }[] };
    player?: { zapHistory?: readonly { id?: string }[] };
}

/** Every id the two views can currently show, deduplicated — a channel that is both starred and recently watched is looked up once. */
function rowIdsOf(state: State): string[] {
    const slice = state as EpgRowsState;
    const ids = new Set<string>();
    for (const row of slice.favorites?.rows ?? []) if (row.id) ids.add(row.id);
    for (const row of slice.player?.zapHistory ?? []) if (row.id) ids.add(row.id);
    return [...ids];
}

/** The now-playing title for each id that has one. Exported for the selector's own use and for tests; the channel lookup is the only impure part and stays in `channelsForIds()`. */
export function nowLinesFor(ids: readonly string[], nowMs: number): Record<string, string> {
    if (ids.length === 0 || !hasEpgPrograms()) return {};
    const channels = channelsForIds(new Set(ids));
    const lines: Record<string, string> = {};
    for (const id of ids) {
        const channel = channels.get(id);
        if (!channel) continue;
        const snapshot = rowEpgSnapshot(epgChannelIdForRow(channel), nowMs);
        if (snapshot) lines[id] = snapshot.nowTitle;
    }
    return lines;
}

/**
 * The channel row behind each wanted id, from Live's grouped rows first
 * (they carry the catalog match, `epgId`) and the raw provider rows for
 * anything Live's filters left out — a starred channel outside the selected
 * country still has a `tvgId` its provider files programmes under.
 *
 * Scanned per call rather than kept as an index: these arrays run to tens of
 * thousands of rows, the wanted set is a handful, and this runs twice a
 * minute. A retained id→row map would be the bigger cost, and a stale one
 * the bigger bug.
 */
export function channelsForIds(ids: ReadonlySet<string>): Map<string, ChannelRow> {
    const found = new Map<string, ChannelRow>();
    for (const rows of [liveDisplayRows(), getRows()]) {
        if (found.size === ids.size) break;
        collectChannels(rows, ids, found);
    }
    return found;
}

function collectChannels(rows: readonly ChannelRow[], ids: ReadonlySet<string>, found: Map<string, ChannelRow>): void {
    for (const row of rows) {
        if (ids.has(row.id) && !found.has(row.id)) found.set(row.id, row);
        // An entry can name a feed that Live collapsed into a variant of the
        // row it is showing — same channel, same guide data.
        for (const variant of row.variants ?? []) {
            if (ids.has(variant.id) && !found.has(variant.id)) found.set(variant.id, row);
        }
        if (found.size === ids.size) return;
    }
}
