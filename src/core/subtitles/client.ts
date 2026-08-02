/**
 * The impure half: two GETs through `getPlatform().http`, and one honest
 * verdict per attempt.
 *
 * Every request sets `noProxy: true`. The user's proxy template
 * (`core/http/README.md`) exists for providers that refuse a browser; both
 * endpoints here already answer one with `Access-Control-Allow-Origin: *`,
 * so sending them through a third party would only add a hop that can fail —
 * and a misconfigured template would break a feature that was working.
 *
 * Failures are classified, never swallowed: `core/http`'s taxonomy already
 * separates "you are offline / this was CORS-blocked" from "it timed out"
 * from "the service answered with a status", and this module collapses those
 * into the one distinction the viewer can act on (`'unreachable'`) while
 * keeping the kind for the message. What it will never do is resolve a
 * pending state — every path below ends in a terminal outcome, because a
 * spinner that hangs is the specific failure this feature must not have.
 */
import { getPlatform } from '../platform';
import type { FetchFailureKind } from '../http/classified-fetch';
import { contentIdFor, rankTitleCandidates, type RankedTitle, type TitleHints } from './identify';
import { orderByLanguage, parseSubtitleList, parseTitleCandidates, subtitleSearchUrl, titleSearchUrl, type RawSubtitle, type TitleKind } from './providers';

/** A search is a catalog lookup a viewer is waiting on — well under the adapter's 15s default, since "nothing found" fast beats "maybe" slow. */
const SEARCH_TIMEOUT_MS = 10_000;
/** A subtitle file is text, and a large one is ~300 KB; twenty seconds is generous even on a bad connection. */
const DOWNLOAD_TIMEOUT_MS = 20_000;
/** No subtitle track is megabytes of text. This is a memory guard against a URL that turns out to point at something else entirely. */
const MAX_SUBTITLE_BYTES = 4_000_000;
/** How many rows the menu will ever show. The service returns dozens for a popular film; a viewer picks from the first handful or gives up. */
const RESULT_CAP = 12;

/** What the title actually resolved to — surfaced so a rung-2 title match is visible to the viewer rather than silently assumed. */
export interface MatchedTitle {
    imdbId: string;
    name: string;
    year: number | null;
    /** False when the match came from a title search that wasn't an exact title+year hit — the UI says "best guess" rather than stating it. */
    confident: boolean;
}

export type SubtitleSearchOutcome =
    | { kind: 'ok'; matched: MatchedTitle; results: RawSubtitle[] }
    /** The ladder ran out: no `tt…` id in the provider's data and no catalog match for the title. */
    | { kind: 'not-identified' }
    /** Identified, but the service has no subtitles for it at all. */
    | { kind: 'none'; matched: MatchedTitle }
    | { kind: 'unreachable'; reason: FetchFailureKind };

export interface SubtitleQuery {
    kind: TitleKind;
    hints: TitleHints;
    /** Series only — which episode of the matched show. */
    episode?: { season: number; episode: number } | null;
    /** ISO 639-1; results in this language sort first, the rest still come back. */
    preferredLanguage: string;
}

export async function findSubtitles(query: SubtitleQuery): Promise<SubtitleSearchOutcome> {
    const identified = await identifyTitle(query);
    if (identified.kind !== 'ok') return identified;

    const contentId = contentIdFor(identified.matched.imdbId, query.episode);
    const response = await getJson(subtitleSearchUrl(query.kind, contentId));
    if (response.kind !== 'ok') return { kind: 'unreachable', reason: response.reason };

    const results = orderByLanguage(parseSubtitleList(response.data), query.preferredLanguage, RESULT_CAP);
    if (results.length === 0) return { kind: 'none', matched: identified.matched };
    return { kind: 'ok', matched: identified.matched, results };
}

/** Rung 1 then rung 2 of `identify.ts`'s ladder. Split out so the network shape of "identification failed" and "search failed" stay distinguishable. */
async function identifyTitle(
    query: SubtitleQuery,
): Promise<{ kind: 'ok'; matched: MatchedTitle } | { kind: 'not-identified' } | { kind: 'unreachable'; reason: FetchFailureKind }> {
    const direct = query.hints.imdbId;
    if (direct) {
        return { kind: 'ok', matched: { imdbId: direct, name: query.hints.title, year: null, confident: true } };
    }
    if (!query.hints.title.trim()) return { kind: 'not-identified' };

    const response = await getJson(titleSearchUrl(query.kind, query.hints.title));
    if (response.kind !== 'ok') return { kind: 'unreachable', reason: response.reason };

    const ranked: RankedTitle | undefined = rankTitleCandidates(parseTitleCandidates(response.data), query.hints)[0];
    if (!ranked) return { kind: 'not-identified' };
    return {
        kind: 'ok',
        matched: {
            imdbId: ranked.candidate.imdbId,
            name: ranked.candidate.name,
            year: ranked.candidate.year,
            confident: ranked.confident,
        },
    };
}

/** Downloads one subtitle file as text. The service re-encodes to UTF-8 for us (`subencoding-stremio-utf8` in its URLs), so no charset guessing happens anywhere in this feature. */
export async function fetchSubtitleText(url: string): Promise<{ kind: 'ok'; text: string } | { kind: 'unreachable'; reason: FetchFailureKind }> {
    const result = await getPlatform().http.get(url, {
        noProxy: true,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        maxBytes: MAX_SUBTITLE_BYTES,
    });
    if (result.kind !== 'ok') return { kind: 'unreachable', reason: result.kind };
    try {
        return { kind: 'ok', text: await result.res.text() };
    } catch {
        // A body that fails mid-read is the `maxBytes` guard firing, which is
        // the same story as an unreachable file from where the viewer sits.
        return { kind: 'unreachable', reason: 'too-large' };
    }
}

async function getJson(url: string): Promise<{ kind: 'ok'; data: unknown } | { kind: 'failed'; reason: FetchFailureKind }> {
    const result = await getPlatform().http.get(url, { noProxy: true, timeoutMs: SEARCH_TIMEOUT_MS });
    if (result.kind !== 'ok') return { kind: 'failed', reason: result.kind };
    try {
        return { kind: 'ok', data: JSON.parse(await result.res.text()) };
    } catch {
        // A 200 that isn't JSON is the service being down behind a proxy page
        // — indistinguishable, from here, from it not answering.
        return { kind: 'failed', reason: 'http' };
    }
}
