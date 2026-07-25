import { computed, type State } from 'spektrum';

interface SourcesState extends State {
    sources?: { count?: number };
}

/**
 * The empty-state "partial" (Feature 02.6.5): since Spektrum has no
 * component/include system, the pattern is shared as one structural
 * contract, not copy-pasted logic — `.empty-state`/`.empty-state__heading`/
 * `.empty-state__message`/`.empty-state__note`/`.empty-state__actions` in
 * `src/styles/shell.css`, reused verbatim by every view's markup in
 * index.html, parameterized only by which `strings.emptyStates.*` values
 * and `data-if` condition each instance binds. This module owns the one
 * piece of *logic* the pattern needs today: the first-run gate.
 *
 * `sources.count` is `setValue`-seeded stub state — Phase 07 replaces the
 * seed with a real count from imported playlists; `hasNoSources` and every
 * view bound to it need no changes when that happens.
 */
export function registerEmptyStateComputeds(): void {
    computed('hasNoSources', ['sources.count'], (state: State) => {
        const count = (state as SourcesState).sources?.count ?? 0;
        return count === 0;
    });
}
