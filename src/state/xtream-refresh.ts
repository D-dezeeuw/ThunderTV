import { getPlatform } from '../core/platform';
import { importXtreamSource } from '../xtream/import';
import { loadPlaylistSources } from './playlist-load';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { setActiveSourceId } from './playlist.actions';
import { get } from './typed';

/**
 * Xtream catalogs go stale fast — panels renumber stream ids routinely, at
 * which point every baked stream URL 404s even though the account is fine.
 * The stored credentials (PlaylistRecord.url/username/password) make a
 * silent re-import possible without asking the user anything.
 *
 * Two triggers share this module:
 *  - boot (bootstrap.ts): refresh the active source when its catalog is
 *    older than the TTL;
 *  - a 404 during playback (src/player/engine.ts's probe): force a refresh
 *    immediately, rate-limited so a dead provider can't cause a loop.
 *
 * 6 hours mirrors the masterplan §19.8 category TTL — a full catalog pull
 * is the heaviest call a panel serves, so more aggressive schedules would
 * be poor provider etiquette for marginal freshness.
 */
export const XTREAM_REFRESH_TTL_MS = 6 * 60 * 60 * 1000;

/** Forced (404-triggered) refreshes are rate-limited — one bad channel must not hammer the panel. */
export const FORCED_REFRESH_MIN_INTERVAL_MS = 10 * 60 * 1000;

let lastForcedAt = 0;
let busy = false;

export function isXtreamCatalogStale(lastRefresh: number | null, now: number): boolean {
    return lastRefresh === null || now - lastRefresh > XTREAM_REFRESH_TTL_MS;
}

/**
 * Re-imports the active Xtream source in place when stale (or when forced).
 * Resolves `true` only when a refresh actually ran and succeeded. The
 * upsert mints a new playlist id, so the active-source pointer is re-aimed
 * afterwards — that write is what makes the visible list reload (Feature
 * 08.10.6's watch).
 */
export type XtreamRefreshTrigger = 'boot' | 'error' | 'manual';

export async function refreshActiveXtreamSource(trigger: XtreamRefreshTrigger = 'boot'): Promise<boolean> {
    if (busy) return false;
    const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
    if (!sourceId) return false;

    const record = (await getPlatform().storage.getAll('playlists')).find((p) => p.id === sourceId);
    if (!record || record.type !== 'xtream' || !record.url || !record.username || !record.password) return false;

    const now = Date.now();
    // boot honors the TTL; a 404-triggered refresh bypasses it but is
    // rate-limited; a user-initiated one always enqueues fresh (Feature
    // 19.6.4's rule).
    if (trigger === 'boot' && !isXtreamCatalogStale(record.lastRefresh, now)) return false;
    if (trigger === 'error' && now - lastForcedAt < FORCED_REFRESH_MIN_INTERVAL_MS) return false;

    busy = true;
    if (trigger !== 'boot') lastForcedAt = now;
    try {
        const outcome = await importXtreamSource({
            url: record.url,
            user: record.username,
            pass: record.password,
            name: record.name,
        });
        if (!outcome.ok) return false;
        await loadPlaylistSources();
        if (get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID) === sourceId) {
            setActiveSourceId(outcome.summary.sourceId);
        }
        return true;
    } finally {
        busy = false;
    }
}

/** Test-only. @internal */
export function resetXtreamRefreshForTests(): void {
    lastForcedAt = 0;
    busy = false;
}
