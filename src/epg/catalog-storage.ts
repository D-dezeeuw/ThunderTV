import { getPlatform } from '../core/platform';
import type { EpgCatalogRecord, StorageAdapter } from '../core/storage';

/** Above any real channel id in string comparison — bounds a `[country, '']..[country, HIGH_KEY]` range to exactly one country's rows (Feature 31.4.5), the same composite-range pattern `epgPrograms`' `[channelId, start]` key already uses. */
const HIGH_KEY = '\uffff';

export async function getCountryCatalog(country: string): Promise<EpgCatalogRecord[]> {
    return getPlatform().storage.getRange('epgCatalog', [country, ''], [country, HIGH_KEY]);
}

/**
 * Replaces one country's `epgCatalog` rows: delete what's there, then write
 * the fresh set (Feature 31.4.4) — never a partial merge, so a channel the
 * upstream feed dropped disappears here too instead of lingering forever.
 * No generic "delete range" exists on `StorageAdapter`, so this reads the
 * current range and deletes each row; a few hundred rows per country, cheap
 * next to the feed fetch itself.
 */
export async function replaceCountryCatalog(country: string, entries: readonly EpgCatalogRecord[]): Promise<void> {
    const storage = getPlatform().storage;
    await clearCountryCatalog(storage, country);
    if (entries.length > 0) {
        await storage.bulkPut('epgCatalog', [...entries], (r) => [r.country, r.id]);
    }
}

async function clearCountryCatalog(storage: StorageAdapter, country: string): Promise<void> {
    const existing = await storage.getRange('epgCatalog', [country, ''], [country, HIGH_KEY]);
    await Promise.all(existing.map((row) => storage.deleteRow('epgCatalog', [row.country, row.id])));
}

/**
 * Scoped to one feed file rather than the whole country (Feature 31.8): a
 * country can have several files, and a TTL-fresh file that wasn't
 * re-fetched this run has no new text to re-derive from — replacing the
 * *whole* country on every ingest would wipe that file's still-valid rows.
 * Same primary key (`[country, id]`) as `replaceCountryCatalog`, so a
 * channel id that moves between files simply lands under whichever file
 * wrote it most recently — never duplicated.
 */
export async function replaceFileCatalog(
    country: string,
    sourceFile: string,
    entries: readonly EpgCatalogRecord[],
): Promise<void> {
    const storage = getPlatform().storage;
    const existing = await storage.getRange('epgCatalog', [country, ''], [country, HIGH_KEY]);
    const stale = existing.filter((row) => row.sourceFile === sourceFile);
    await Promise.all(stale.map((row) => storage.deleteRow('epgCatalog', [row.country, row.id])));
    if (entries.length > 0) {
        await storage.bulkPut('epgCatalog', [...entries], (r) => [r.country, r.id]);
    }
}
