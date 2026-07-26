import { setValue } from 'spektrum';
import type { ChannelRow } from '../m3u/types';
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
export function publishListWindow(visibleRows: readonly ChannelRow[], padTop: number, padBottom: number): void {
    set(LIST_VISIBLE_ROWS, visibleRows as ChannelRow[]);
    setValue(LIST_PAD_TOP, padTop);
    setValue(LIST_PAD_BOTTOM, padBottom);
}
