import { computed, type State } from 'spektrum';
import { PLAYLIST_SOURCE_COUNT } from './playlist';

/**
 * Migrated from `src/ui/empty-state.ts` as part of Phase 05's selector
 * consolidation (Feature 05.6.1).
 *
 * `activeSource` (Feature 05.6.2, joining `playlist.activeSourceId` against
 * `playlist.sources`) is deliberately **not** implemented yet — neither key
 * exists: `src/state/playlist.ts` still only holds the Phase 01-03 stub
 * fields (`sourceCount`/`demoRows`/`lastPickedLabel`). Inventing the real
 * shape now would mean guessing at Phase 07's design; that phase is what
 * actually defines `playlist.sources`/`activeSourceId` and is the right
 * place to add this selector alongside them.
 */
export function registerPlaylistSelectors(): void {
    computed('hasNoSources', [PLAYLIST_SOURCE_COUNT], (state: State) => {
        const count = (state as { playlist?: { sourceCount?: number } }).playlist?.sourceCount ?? 0;
        return count === 0;
    });
}
