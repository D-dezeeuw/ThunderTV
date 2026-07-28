import { computed, type State } from 'spektrum';
import { isHiddenSource, visibleSources } from './hidden-sources';
import { PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';

interface SourcesState {
    playlist?: { sources?: PlaylistSourceSummary[]; activeSourceId?: string | null };
}

/**
 * Migrated from `src/ui/empty-state.ts` as part of Phase 05's selector
 * consolidation (Feature 05.6.1). `activeSource` (Feature 05.6.2) is now
 * real — `playlist.sources`/`activeSourceId` are the actual Phase 07
 * shape, no longer a Phase 01-03 stub.
 */
export function registerPlaylistSelectors(): void {
    computed('hasNoSources', [PLAYLIST_SOURCES], (state: State) => {
        const sources = (state as SourcesState).playlist?.sources ?? [];
        return sources.length === 0;
    });

    // The picker hides known-dead provider hosts; Settings still binds to
    // the raw `playlist.sources`, so nothing is ever unreachable.
    computed('visibleSources', [PLAYLIST_SOURCES], (state: State) => {
        return visibleSources((state as SourcesState).playlist?.sources ?? []);
    });

    computed('hiddenSources', [PLAYLIST_SOURCES], (state: State) => {
        return ((state as SourcesState).playlist?.sources ?? []).filter((s) => isHiddenSource(s));
    });

    computed('hasHiddenSources', [PLAYLIST_SOURCES], (state: State) => {
        return ((state as SourcesState).playlist?.sources ?? []).some((s) => isHiddenSource(s));
    });

    computed('activeSource', [PLAYLIST_SOURCES, PLAYLIST_ACTIVE_SOURCE_ID], (state: State) => {
        const { sources, activeSourceId } = (state as SourcesState).playlist ?? {};
        if (!activeSourceId || !sources) return null;
        return sources.find((s) => s.id === activeSourceId) ?? null;
    });
}
