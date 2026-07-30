import { setValue } from 'spektrum';
import { proxyImageUrl } from '../core/http/proxy';
import { effectiveProxyTemplate } from '../core/platform/electron-platform';
import type { ChannelRow } from '../m3u/types';
import { isUrlLikelyDead } from '../health/store';
import { hasEpgPrograms, rowEpgSnapshot } from './epg-index';
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
/** One row's last published output, kept alongside the base row it was derived from so a reuse can only ever happen for an unchanged base. */
interface EmittedRow {
    base: ChannelRow;
    out: ChannelRow;
}

/** Only ever holds the last published window (≈40 rows), replaced wholesale on every publish — never a growing cache. */
let lastEmitted = new Map<string, EmittedRow>();

/** Test-only reset, same convention as `virtual-list.ts`'s. @internal */
export function resetListPublishForTests(): void {
    lastEmitted = new Map();
}

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

    const rows = visibleRows.map((row) => {
        const logo = proxyImageUrl(template, row.logo);
        const epg = enrich ? rowEpgSnapshot(row.epgId, nowMs) : null;
        const unhealthy = isUrlLikelyDead(row.url, nowMs);
        if (logo === row.logo && !epg && !unhealthy) return row;

        // Reuse the object emitted for this row last time when nothing it
        // derives has actually changed. A row that needs enrichment used to
        // allocate a fresh object on *every* publish — i.e. every scroll
        // frame — which is why Live and Radio churned identities while
        // Categories (whose rows fall out of the fast path above unchanged)
        // did not, and why only those two lists thrashed. The `data-key` on
        // the markup's `data-each` is the real guard; this keeps even the
        // window's own diff and the GC quiet on a TV.
        const cached = lastEmitted.get(row.id);
        if (
            cached &&
            cached.base === row &&
            cached.out.logo === logo &&
            cached.out.epgNowTitle === epg?.nowTitle &&
            cached.out.epgNextTitle === epg?.nextTitle &&
            cached.out.epgProgress === epg?.progress &&
            (cached.out.unhealthy ?? false) === unhealthy
        ) {
            return cached.out;
        }

        return {
            ...row,
            logo,
            ...(epg
                ? { epgNowTitle: epg.nowTitle, epgNextTitle: epg.nextTitle, epgProgress: epg.progress }
                : {}),
            ...(unhealthy ? { unhealthy: true } : {}),
        };
    });

    const nextEmitted = new Map<string, EmittedRow>();
    for (let i = 0; i < rows.length; i++) {
        const out = rows[i];
        const base = visibleRows[i];
        if (out && base && out !== base) nextEmitted.set(base.id, { base, out });
    }
    lastEmitted = nextEmitted;

    set(LIST_VISIBLE_ROWS, rows);
    setValue(LIST_PAD_TOP, padTop);
    setValue(LIST_PAD_BOTTOM, padBottom);
}
