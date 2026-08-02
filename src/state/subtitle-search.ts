import { setValue } from 'spektrum';

/**
 * The subtitle menu's "search the internet" panel: one key holding what that
 * search is currently doing and what it found.
 *
 * One object rather than three flat keys because all three fields describe a
 * single attempt and are always written together — there is no state in which
 * `status` and `message` can honestly disagree. It is written whole every
 * time, so Spektrum's object *merge* (`state/README.md`'s Feature 08 finding)
 * never has a stale field left over to reveal; no `replace()` is needed and
 * the key is not map-shaped.
 *
 * **The URLs are deliberately not here.** `subtitle-search.actions.ts` keeps
 * the raw provider rows in module memory and publishes only these compact
 * display rows — the same "queue lives in module memory, state is a
 * projection" shape `downloads.ts` uses, and for the same reason: a download
 * URL is machinery, not something a view should be able to render.
 *
 * Never persisted. A results list belongs to the film that is playing right
 * now; restoring one across a reload would offer subtitles for something the
 * viewer is no longer watching.
 */
export const PLAYER_SUBTITLE_SEARCH = 'player.subtitleSearch';

/**
 * `'idle'` — never run for this stream. `'searching'` — a request is in
 * flight (the only state that shows a busy row). `'results'` — rows to pick
 * from. `'done'` — a terminal message and nothing to pick, covering "found
 * nothing", "couldn't identify this", "the service is unreachable" and "a
 * subtitle was attached". Every non-`'searching'` state is terminal by
 * construction, which is what makes "a spinner that hangs" unrepresentable.
 */
export type SubtitleSearchStatus = 'idle' | 'searching' | 'results' | 'done';

/** One offered subtitle, as the menu renders it. `id` is the provider's own row id, which `subtitle-search.actions.ts` resolves back to a URL. */
export interface OnlineSubtitleRow {
    id: string;
    label: string;
    /** Uppercased ISO 639-1 (`EN`, `NL`) — the menu's existing `.track-menu__lang` column. */
    lang: string;
}

export interface SubtitleSearchState {
    status: SubtitleSearchStatus;
    /** Resolved copy, not a reason code — same contract as `player.playbackNotice`, which this sits beside in the player bar. `''` means "say nothing". */
    message: string;
    results: OnlineSubtitleRow[];
}

/** A search returns at most a dozen rows (`core/subtitles/client.ts`'s own cap); this is the state-layer ceiling that makes that a registry-checked fact. */
export const SUBTITLE_RESULTS_CAP = 12;

/**
 * What the player is playing, reduced to what a subtitle lookup needs — the
 * value `subtitle-search.actions.ts` builds and hands to the lazily-loaded
 * `subtitle-search.run.ts`.
 *
 * It exists as a plain data shape for a bundling reason worth stating once:
 * working out *which* film is playing needs `vod-rows.ts`/`series-rows.ts`,
 * both of which are already on the boot path. If the lazy chunk imported
 * them, rolldown would split them into a *shared* chunk that the eager graph
 * then has to preload — which cost more (+3.3 KiB gzip in split overhead)
 * than the code being made lazy saved. So identification stays eager, where
 * that code already lives, and only the network/parse/attach half is
 * deferred.
 *
 * `imdbId` is deliberately the provider's raw value, unvalidated:
 * `core/subtitles`'s `asImdbId()` is the one place that decides what counts,
 * and it lives in the lazy half.
 */
export interface SubtitleTarget {
    kind: 'movie' | 'series';
    /** `player.active`'s row id (`vod:123` / `series-ep:12:345`) — credential-free and stable across a password rotation, which is what makes it a sound cache key. */
    playbackId: string;
    title: string;
    year: string | null;
    imdbId: string | null;
    tmdbId: number | null;
    /** Series only. */
    episode: { season: number; episode: number } | null;
    /** ISO 639-1; results in this language sort first, the rest still come back. */
    preferredLanguage: string;
}

export const SUBTITLE_SEARCH_DEFAULTS: SubtitleSearchState = {
    status: 'idle',
    message: '',
    results: [],
};

export function initSubtitleSearchState(): void {
    setValue(PLAYER_SUBTITLE_SEARCH, SUBTITLE_SEARCH_DEFAULTS);
}
