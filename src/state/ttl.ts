/**
 * Pure TTL freshness check shared by every lazily-fetched Xtream catalog
 * (VOD/series categories and items, and their per-item detail cache,
 * `catalog-memory.ts`/`catalog-storage.ts`) — no Spektrum, no storage, so
 * it is unit-testable against a mocked clock without any platform
 * scaffolding. Mirrors `xtream-refresh.ts`'s `isXtreamCatalogStale()`
 * shape (same "null fetchedAt is always stale" rule), kept as its own
 * module rather than merged into that file since catalogs and the
 * whole-source refresh are different TTLs (24h here vs. 6h there) with
 * different callers.
 */
export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

/** `fetchedAt === null` (never fetched) is always stale, regardless of `now`/`ttlMs`. */
export function isFresh(fetchedAt: number | null, now: number, ttlMs: number): boolean {
    return fetchedAt !== null && now - fetchedAt < ttlMs;
}
