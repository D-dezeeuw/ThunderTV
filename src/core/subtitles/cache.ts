/**
 * A downloaded subtitle, kept so a replay never re-hits the service.
 *
 * Two tiers, matching `core/storage/README.md`'s split rather than inventing
 * a third rule:
 *
 * - **Session memory, always.** Rewinding or reopening the same film in one
 *   sitting is the common case, and it should cost nothing on any tier.
 * - **Storage, on the `'full'` tier only** — the same gate
 *   `state/catalog-storage.ts` applies, for the same reason. A subtitle file
 *   is 30–300 KB of text; that is not what `localStorage`'s ~5 MB budget is
 *   for, and a failed write there would trip the tier controller's permanent
 *   demotion over a cache that is allowed to simply not persist.
 *
 * Keyed on content id + language, never on the stream URL: an Xtream URL
 * carries credentials and changes when they rotate, while `tt0111161:1:2`
 * names the same episode forever. The index key bounds the whole cache to
 * `MAX_ENTRIES` on an oldest-first eviction, so this can never grow without
 * limit on a device the viewer never clears.
 */
import { getPlatform } from '../platform';

export interface CachedSubtitle {
    fetchedAt: number;
    /** ISO 639-1. */
    lang: string;
    /** Already-converted WebVTT — the SRT→VTT pass is deterministic, so caching its output saves doing it twice. */
    vtt: string;
}

/** Enough for a season of one show plus a few films, and small enough that the whole index stays a cheap read. */
const MAX_ENTRIES = 40;
const INDEX_KEY = 'subtitles.cache.index';

const memory = new Map<string, CachedSubtitle>();

function entryKey(contentId: string, lang: string): string {
    return `subtitles.cache.${contentId}.${lang}`;
}

function tierIsFull(): boolean {
    return getPlatform().storage.tier === 'full';
}

export async function loadCachedSubtitle(contentId: string, lang: string): Promise<CachedSubtitle | undefined> {
    const key = entryKey(contentId, lang);
    const hit = memory.get(key);
    if (hit) return hit;
    if (!tierIsFull()) return undefined;

    const stored = await getPlatform().storage.get<CachedSubtitle>(key);
    if (stored?.vtt) memory.set(key, stored);
    return stored?.vtt ? stored : undefined;
}

/**
 * Writes through both tiers. Storage failures are deliberately ignored: the
 * subtitle is already attached and already in session memory by the time this
 * runs, so a full disk must not turn a working subtitle into an error.
 */
export async function saveCachedSubtitle(contentId: string, entry: CachedSubtitle): Promise<void> {
    const key = entryKey(contentId, entry.lang);
    memory.set(key, entry);
    if (!tierIsFull()) return;

    const storage = getPlatform().storage;
    const index = (await storage.get<string[]>(INDEX_KEY)) ?? [];
    const next = [...index.filter((existing) => existing !== key), key];
    const evicted = next.splice(0, Math.max(0, next.length - MAX_ENTRIES));

    await storage.set(key, entry);
    await storage.set(INDEX_KEY, next);
    for (const stale of evicted) await storage.delete(stale);
}

/** Test-only reset of the session tier. @internal */
export function resetSubtitleCacheForTests(): void {
    memory.clear();
}
