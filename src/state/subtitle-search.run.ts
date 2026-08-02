import { refs } from 'spektrum';
import { strings } from '../app/strings';
import {
    asImdbId,
    fetchSubtitleText,
    findSubtitles,
    loadCachedSubtitle,
    saveCachedSubtitle,
    type RawSubtitle,
    type SubtitleQuery,
} from '../core/subtitles';
import { addExternalSubtitle } from '../player/external-subs';
import { toVtt } from '../player/subtitle-text';
import { PLAYER_TRACK_MENU } from './player-tracks';
import { publishTrackLists } from './player-tracks.actions';
import { PLAYER_SUBTITLE_SEARCH, SUBTITLE_RESULTS_CAP, type OnlineSubtitleRow, type SubtitleSearchState, type SubtitleTarget } from './subtitle-search';
import { set } from './typed';

/**
 * The working half of "Search subtitles online": look it up, download it,
 * convert it, attach it. Loaded on demand by `subtitle-search.actions.ts`
 * (see its header for why, and `SubtitleTarget`'s doc for why identification
 * is deliberately *not* in here).
 *
 * The identification ladder itself is `core/subtitles/identify.ts`. This file
 * only turns a `SubtitleTarget` into its query, and turns every possible
 * outcome into exactly one line of copy — there is no path through it that
 * leaves the panel busy.
 *
 * **Movies and TV episodes only.** A live channel has no title to identify
 * and no fixed timeline to line cues up against; the markup renders the row
 * in the Movies/TV Shows views only, and a `null` target lands on the
 * "couldn't identify this" message.
 */

/**
 * The rows the last search returned, in full. State gets the compact
 * projection (`subtitle-search.ts`'s doc) — this keeps the URLs, keyed by the
 * playback id they were fetched for, so a stale press after a channel change
 * can't attach the previous film's file.
 */
let lastResults: RawSubtitle[] = [];
let lastResultsFor = '';
/**
 * Playback ids whose cached subtitle has already been served once this
 * session. A second press then goes to the network — the cache exists so a
 * replay is instant, not so the viewer is stuck forever with the first file
 * they ever picked for this film.
 */
const cacheServed = new Set<string>();

export async function searchOnlineSubtitles(target: SubtitleTarget | null): Promise<void> {
    if (!target) {
        publish({ status: 'done', message: strings.list.subtitlesOnlineUnidentified, results: [] });
        return;
    }

    const lang = target.preferredLanguage;
    if (!cacheServed.has(target.playbackId)) {
        const cached = await loadCachedSubtitle(target.playbackId, lang);
        if (cached) {
            cacheServed.add(target.playbackId);
            const attached = attach(cached.vtt, lang, strings.list.subtitlesOnlineCachedLabel);
            publish({
                status: 'done',
                message: attached ? strings.list.subtitlesOnlineCached : strings.list.subtitlesOnlineAttachFailed,
                results: [],
            });
            return;
        }
    }

    publish({ status: 'searching', message: strings.list.subtitlesOnlineSearching, results: [] });
    const outcome = await findSubtitles(queryFor(target));

    if (outcome.kind === 'unreachable') {
        // `core/http`'s taxonomy, collapsed to the two things a viewer can act
        // on: wait and retry, or accept that this device cannot reach the
        // service at all (a CORS-blocking network, an offline laptop).
        // Neither is a fault of the film they are watching.
        const message = outcome.reason === 'timeout' ? strings.list.subtitlesOnlineTimeout : strings.list.subtitlesOnlineUnreachable;
        publish({ status: 'done', message, results: [] });
        return;
    }
    if (outcome.kind === 'not-identified') {
        publish({ status: 'done', message: strings.list.subtitlesOnlineUnidentified, results: [] });
        return;
    }
    if (outcome.kind === 'none') {
        publish({ status: 'done', message: strings.list.subtitlesOnlineNone, results: [] });
        return;
    }

    lastResults = outcome.results;
    lastResultsFor = target.playbackId;
    publish({
        status: 'results',
        message: outcome.matched.confident ? '' : matchedNote(outcome.matched.name, outcome.matched.year),
        results: outcome.results.slice(0, SUBTITLE_RESULTS_CAP).map(toRow),
    });
}

/** Downloads the picked row, converts it, attaches it as a `<track>`, and caches the converted text. `id` is a provider row id from `player.subtitleSearch.results`. */
export async function useOnlineSubtitle(target: SubtitleTarget | null, id: string): Promise<void> {
    const picked = lastResults.find((row) => row.id === id);
    if (!target || !picked || lastResultsFor !== target.playbackId) {
        publish({ status: 'done', message: strings.list.subtitlesOnlineAttachFailed, results: [] });
        return;
    }

    publish({ status: 'searching', message: strings.list.subtitlesOnlineDownloading, results: [] });
    const downloaded = await fetchSubtitleText(picked.url);
    if (downloaded.kind !== 'ok') {
        publish({ status: 'done', message: strings.list.subtitlesOnlineUnreachable, results: [] });
        return;
    }

    const vtt = toVtt(downloaded.text);
    if (!vtt || !attach(vtt, picked.lang, labelFor(picked))) {
        publish({ status: 'done', message: strings.list.subtitlesOnlineAttachFailed, results: [] });
        return;
    }

    await saveCachedSubtitle(target.playbackId, { fetchedAt: Date.now(), lang: picked.lang, vtt });
    publish({ status: 'done', message: '', results: [] });
    set(PLAYER_TRACK_MENU, 'none');
}

/** The provider's raw `imdb_id` is validated here rather than at the call site: `asImdbId()` is the one place that decides what counts as one, and it ships in this chunk. */
export function queryFor(target: SubtitleTarget): SubtitleQuery {
    return {
        kind: target.kind,
        preferredLanguage: target.preferredLanguage,
        episode: target.episode,
        hints: {
            title: target.title,
            year: target.year,
            imdbId: asImdbId(target.imdbId),
            tmdbId: target.tmdbId,
        },
    };
}

/** Attaches converted text to the shared `<video>` and republishes the track lists, so the new subtitle appears in the very menu it was fetched from. */
function attach(vtt: string, lang: string, label: string): boolean {
    const video = refs['playerVideo'];
    if (!(video instanceof HTMLVideoElement)) return false;
    if (!addExternalSubtitle(video, { label, lang, text: vtt })) return false;
    publishTrackLists();
    return true;
}

/** Rows are numbered because the service publishes no release name — only a language and an id. A number at least tells two English entries apart, and picking another is one press away. */
function labelFor(row: RawSubtitle): string {
    return `${strings.list.subtitlesOnlineProvider} ${String(lastResults.indexOf(row) + 1)}`;
}

function toRow(row: RawSubtitle): OnlineSubtitleRow {
    return { id: row.id, label: labelFor(row), lang: row.lang.toUpperCase() };
}

/** Shown above the results when the title match was a guess rather than an exact title+year hit — so the viewer can see it picked the wrong film before they wonder why the cues are nonsense. */
function matchedNote(name: string, year: number | null): string {
    const title = year === null ? name : `${name} (${String(year)})`;
    return strings.list.subtitlesOnlineMatchedTemplate.replace('{title}', title);
}

function publish(next: SubtitleSearchState): void {
    set(PLAYER_SUBTITLE_SEARCH, next);
}

/** Drops the offered rows. `clearSubtitleSearch()` calls this only when this chunk was ever loaded — if it wasn't, there is nothing to forget. */
export function forgetResults(): void {
    lastResults = [];
    lastResultsFor = '';
}

/** Test-only reset of this module's memory. @internal */
export function resetSubtitleSearchForTests(): void {
    forgetResults();
    cacheServed.clear();
}
