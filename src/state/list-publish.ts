import { setValue } from 'spektrum';
import { proxyImageUrl } from '../core/http/proxy';
import { effectiveProxyTemplate } from '../core/platform/electron-platform';
import type { ChannelRow } from '../m3u/types';
import { isUrlLikelyDead } from '../health/store';
import { epgChannelIdForRow, hasEpgPrograms, rowEpgSnapshot } from './epg-index';
import { LIST_PAD_BOTTOM, LIST_PAD_TOP, LIST_VISIBLE_ROWS } from './list';
import { set } from './typed';

/**
 * The fourth sanctioned non-`defineFn` publisher (state/README.md's
 * "third, not yet built" note, now built) — called directly by
 * `src/ui/virtual-list.ts` on every scroll-driven republish. There is no
 * discrete user "mutation" to name here: it's a continuous, rAF-throttled
 * derivation of scroll position, exactly like `router.ts`'s `applyRoute()`
 * and `epg.ts`'s tick. `visibleRows` goes through the typed `set()` (Feature
 * 08.10.5) so the dev-mode bulk-data guard is live on this path — a future
 * regression that hands it an unbounded array warns immediately in dev.
 *
 * Split out from `state/list.ts` (rather than living beside the key
 * constants there) purely to keep that file free of a `state/typed.ts`
 * import — see `list.ts`'s own header comment for the ESM cycle that avoids.
 */
/** One row's published view object, kept alongside the base row it was last derived from so an unchanged base costs no re-derivation. */
interface EmittedRow {
    base: ChannelRow;
    out: ChannelRow;
}

/** Only ever holds the last published window (≈40 rows), rebuilt wholesale on every publish — never a growing cache. */
let lastEmitted = new Map<string, EmittedRow>();

/** Test-only reset, same convention as `virtual-list.ts`'s. @internal */
export function resetListPublishForTests(): void {
    lastEmitted = new Map();
}

/**
 * Publishes one window, joining every row to its enrichment **by row id**.
 *
 * The join has to be by id rather than by window position because of how
 * Spektrum's keyed `data-each` binds: a clone's scope captures
 * `item = array[index]` when it is bound, and the engine only re-scopes that
 * clone when its *index* within the published array changes (verified
 * against the vendored engine — `oe()`'s `w.index !== y` guard). A republish
 * that leaves a row at the same index therefore keeps the object the clone
 * was originally bound to, so a freshly derived row object at that slot is
 * simply never read: the row goes on wearing the EPG line it was bound with
 * while its neighbours, whose indices did shift, update around it. That is
 * the "EPG blocks attach to the wrong channels after new channels lazy-load
 * in" report — an append leaves every row already on screen at its index.
 *
 * So the object published for a row id is *stable for as long as that row
 * stays in the window*, and each publish updates it in place. Whatever clone
 * is bound to it, at whatever index, reads current values; a row can only
 * ever wear its own line. The enrichment fields are always written (never
 * omitted), for the same reason: the engine skips a binding whose delta path
 * is `undefined`, so an omitted `epgNowTitle` would leave the previous
 * programme on screen instead of clearing it.
 *
 * The stable identity also keeps the keyed `data-each` diff and the GC quiet
 * mid-scroll, which is what the earlier reuse cache existed for.
 */
export function publishListWindow(visibleRows: readonly ChannelRow[], padTop: number, padBottom: number): void {
    // Mixed-content logo fix: http:// provider logos on the https-deployed
    // page silently fail (empty boxes) — route just the visible window's
    // logos through the configured proxy (proxyImageUrl is a no-op when
    // nothing would be blocked). Per-window mapping keeps it on-demand: at
    // most ~40 rows per publish, and the worker edge-caches image responses.
    const template = effectiveProxyTemplate();
    // Read the clock once for the whole window, not per row: every row in one
    // publish must agree on "now", or two rows' progress bars could describe
    // different instants (visible as a bar that jumps backwards on a row that
    // happened to be enriched a millisecond later).
    const nowMs = Date.now();
    const enrich = hasEpgPrograms();

    const nextEmitted = new Map<string, EmittedRow>();
    const rows = visibleRows.map((row) => {
        // The view object this id already had, if it was in the last window
        // too — a row entering the window is the only thing that allocates.
        const previous = lastEmitted.get(row.id);
        const out = previous?.out ?? { ...row };
        // A replaced base (a re-parsed chunk, a regrouped Live row) copies
        // over the same object rather than starting a new one, so the clone
        // bound to it keeps reading the row it is showing.
        if (previous && previous.base !== row) Object.assign(out, row);

        out.logo = proxyImageUrl(template, row.logo);
        const epg = enrich ? rowEpgSnapshot(epgChannelIdForRow(row), nowMs) : null;
        out.epgNowTitle = epg?.nowTitle ?? null;
        out.epgProgress = epg?.progress ?? 0;
        out.unhealthy = isUrlLikelyDead(row.url, nowMs);

        nextEmitted.set(row.id, { base: row, out });
        return out;
    });
    lastEmitted = nextEmitted;

    set(LIST_VISIBLE_ROWS, rows);
    setValue(LIST_PAD_TOP, padTop);
    setValue(LIST_PAD_BOTTOM, padBottom);
}
