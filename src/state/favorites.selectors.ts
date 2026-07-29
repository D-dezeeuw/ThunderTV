import { computed, type State } from 'spektrum';
import { FAVORITES_ROWS } from './favorites';

/**
 * `hasNoFavorites` is the Starred view's empty-state gate — the same shape
 * as `player.selectors.ts`'s `hasNoZapHistory`, kept a selector rather than
 * an expression in markup so the "is it empty" decision has one site.
 */
export function registerFavoritesSelectors(): void {
    computed('hasNoFavorites', [FAVORITES_ROWS], (state: State) => {
        const rows = (state as { favorites?: { rows?: unknown[] } }).favorites?.rows;
        return !rows || rows.length === 0;
    });
}
