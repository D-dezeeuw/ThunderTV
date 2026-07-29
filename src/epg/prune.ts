import { getPlatform } from '../core/platform';

/** Programs are stored for the Guide's rolling window, not as a permanent archive — 24h past their `stop` is well past any usefulness (now/next, the timetable's few-hour window). */
export const PROGRAM_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes `epgPrograms` rows whose `stop` has aged past `maxAgeMs` before
 * now (Feature 31.8.5) — called once per boot and after each ingest, so
 * program storage stays bounded instead of growing across the app's
 * lifetime. A blanket sweep over every stored program rather than a
 * per-channel range query: `stop` isn't part of the `[channelId, start]`
 * primary key, and the realistic row count (only matched channels'
 * programs are ever stored) keeps an in-memory filter cheap.
 */
export async function pruneStalePrograms(maxAgeMs: number): Promise<number> {
    const storage = getPlatform().storage;
    const cutoff = Date.now() - maxAgeMs;
    const all = await storage.getAll('epgPrograms');
    const stale = all.filter((program) => program.stop < cutoff);
    await Promise.all(stale.map((program) => storage.deleteRow('epgPrograms', [program.channelId, program.start])));
    return stale.length;
}
