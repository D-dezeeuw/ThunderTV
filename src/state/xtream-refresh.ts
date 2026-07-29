import { getPlatform } from '../core/platform';
import type { PlaylistRecord } from '../core/storage';
import { importXtreamSource } from '../xtream/import';
import type { XtreamSource } from '../xtream/types';
import { loadPlaylistSources } from './playlist-load';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { setActiveSourceId } from './playlist.actions';
import { get } from './typed';

export interface ResolvedXtreamAccount {
    sourceId: string;
    record: PlaylistRecord;
    source: XtreamSource;
}

/**
 * The one place that resolves "the active Xtream account" — reused by the
 * VOD/series catalog open actions (`vod.actions.ts`/`series.actions.ts`)
 * instead of re-deriving `PlaylistRecord` → `XtreamSource` by hand a second
 * and third time. `null` for exactly the same reasons `refreshActiveXtreamSource()`
 * used to inline before this was pulled out: no active source, the active
 * source isn't an Xtream record, or it's missing a credential field.
 */
export async function resolveActiveXtreamSource(): Promise<ResolvedXtreamAccount | null> {
    const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
    if (!sourceId) return null;

    const record = (await getPlatform().storage.getAll('playlists')).find((p) => p.id === sourceId);
    if (!record || record.type !== 'xtream' || !record.url || !record.username || !record.password) return null;

    return { sourceId, record, source: { url: record.url, user: record.username, pass: record.password } };
}

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

/** `skipped` = fresh-enough (boot) or refreshed-too-recently (error); `unavailable` = the active source is not a refreshable Xtream record. */
export type XtreamRefreshOutcome = 'refreshed' | 'skipped' | 'unavailable' | 'failed';

export async function refreshActiveXtreamSource(trigger: XtreamRefreshTrigger = 'boot'): Promise<XtreamRefreshOutcome> {
    if (busy) return 'skipped';
    const account = await resolveActiveXtreamSource();
    if (!account) return 'unavailable';

    const now = Date.now();
    // boot honors the TTL; a 404-triggered refresh bypasses it but is
    // rate-limited; a user-initiated one always enqueues fresh (Feature
    // 19.6.4's rule).
    if (trigger === 'boot' && !isXtreamCatalogStale(account.record.lastRefresh, now)) return 'skipped';
    if (trigger === 'error' && now - lastForcedAt < FORCED_REFRESH_MIN_INTERVAL_MS) return 'skipped';

    busy = true;
    if (trigger !== 'boot') lastForcedAt = now;
    try {
        const outcome = await importXtreamSource({
            url: account.source.url,
            user: account.source.user,
            pass: account.source.pass,
            name: account.record.name,
        });
        if (!outcome.ok) return 'failed';
        await loadPlaylistSources();
        if (get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID) === account.sourceId) {
            setActiveSourceId(outcome.summary.sourceId);
        }
        return 'refreshed';
    } finally {
        busy = false;
    }
}

/** Test-only. @internal */
export function resetXtreamRefreshForTests(): void {
    lastForcedAt = 0;
    busy = false;
}
