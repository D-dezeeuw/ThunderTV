import { warmSeriesCatalog } from './series-warm';
import { warmVodCatalog } from './vod-warm';

/**
 * Convenience for warming both catalogs together — the app layer's likely
 * common case ("warm everything after first paint"), still just calling the
 * two independently-guarded, independently-TTL'd functions. Either one
 * failing (rejecting) does not stop the other — both are best-effort
 * background passes, never something a caller should need to catch per-call.
 */
export async function warmCatalogs(): Promise<void> {
    await Promise.allSettled([warmVodCatalog(), warmSeriesCatalog()]);
}
