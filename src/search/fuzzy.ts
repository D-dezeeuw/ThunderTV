import { normalizeForSearch } from './normalize.ts';

/**
 * Fuzzy scoring and ranking over pre-normalized search keys.
 *
 * Both `fuzzyScore`'s arguments must already be run through
 * `normalizeForSearch()` (see `normalize.ts`) — this module never
 * normalizes a target, and normalizes the query exactly once per
 * `rankSearch()` call, not per candidate. That split is what keeps a 20k-row
 * live-channel list searchable at keystroke speed: normalization (Unicode
 * decomposition, regex passes) happens once per row at catalog-load time,
 * and every keystroke after that is pure string/char-code comparison.
 *
 * ## Ranking tiers (highest first)
 *
 * 1. **Exact** — the whole normalized query equals the whole normalized
 *    target.
 * 2. **Substring** — the query occurs verbatim somewhere in the target;
 *    an earlier occurrence scores higher.
 * 3. **Word-prefix** — every word in the query is a prefix of some word in
 *    the target, matched left to right (query `"npo 1"` against target
 *    `"npo 1 hd"`; `"1 npo"` does not qualify — order matters).
 * 4. **Subsequence** — the query's characters appear in the target in
 *    order, with gaps allowed; a tighter span (less filler between the
 *    first and last matched character) scores higher.
 *
 * Within every tier, a shorter target gets a mild additional boost — a
 * tie-breaker, never enough to jump a tier (see the constants below).
 * `null` means no match at all: the target fails even the loosest,
 * subsequence, tier.
 */

/** Tiers are spaced this far apart so no combination of in-tier bonuses can push a lower tier's score into a higher tier's range (see the module-level bonus caps below — their sum is smaller by three orders of magnitude). */
const TIER_SHIFT = 1_000_000;

const TIER_EXACT = 4 * TIER_SHIFT;
const TIER_SUBSTRING = 3 * TIER_SHIFT;
const TIER_WORD_PREFIX = 2 * TIER_SHIFT;
const TIER_SUBSEQUENCE = 1 * TIER_SHIFT;

// In-tier bonuses. Each is a diminishing `MAX / (n + 1)` curve rather than a
// linear subtraction, so it stays positive and bounded for any position/span/
// length instead of needing a clamp. Position and tightness are the primary
// signal within a tier (hence the larger caps); target length is explicitly
// "mild" per the module contract, so its cap is an order of magnitude
// smaller. The three caps' sum (210,000) stays well under TIER_SHIFT so
// tiers never bleed into each other.
const POSITION_BONUS_MAX = 100_000;
const TIGHTNESS_BONUS_MAX = 100_000;
const LENGTH_BONUS_MAX = 10_000;

function positionBonus(position: number): number {
    return POSITION_BONUS_MAX / (position + 1);
}

function tightnessBonus(span: number): number {
    return TIGHTNESS_BONUS_MAX / (span + 1);
}

function lengthBonus(targetLength: number): number {
    return LENGTH_BONUS_MAX / (targetLength + 1);
}

const SPACE_CODE = 32;

/** Half-open `[start, end)` span of the next non-space run at or after `from`, or `null` past the string's end. */
function nextWord(str: string, from: number): { start: number; end: number } | null {
    let start = from;
    while (start < str.length && str.charCodeAt(start) === SPACE_CODE) start++;
    if (start >= str.length) return null;
    let end = str.indexOf(' ', start);
    if (end === -1) end = str.length;
    return { start, end };
}

/** Whether `target[tStart, tEnd)` starts with `query[qStart, qEnd)`, compared char-code by char-code (no substring allocation). */
function wordStartsWith(
    target: string,
    tStart: number,
    tEnd: number,
    query: string,
    qStart: number,
    qEnd: number,
): boolean {
    const qLen = qEnd - qStart;
    if (tEnd - tStart < qLen) return false;
    for (let i = 0; i < qLen; i++) {
        if (target.charCodeAt(tStart + i) !== query.charCodeAt(qStart + i)) return false;
    }
    return true;
}

/**
 * Walks both strings' word lists left to right: each query word must prefix
 * some target word that comes after the previously matched one. Returns the
 * character span covered by the first through last matched target word, or
 * `null` if any query word runs out of target words to try.
 */
function wordPrefixMatch(
    query: string,
    target: string,
): { firstStart: number; lastEnd: number } | null {
    let qPos = 0;
    let tPos = 0;
    let firstStart = -1;
    let lastEnd = -1;

    for (;;) {
        const qWord = nextWord(query, qPos);
        if (qWord === null) break;
        qPos = qWord.end;

        let matched = false;
        for (;;) {
            const tWord = nextWord(target, tPos);
            if (tWord === null) break;
            tPos = tWord.end;
            if (wordStartsWith(target, tWord.start, tWord.end, query, qWord.start, qWord.end)) {
                if (firstStart === -1) firstStart = tWord.start;
                lastEnd = tWord.end;
                matched = true;
                break;
            }
        }
        if (!matched) return null;
    }

    return firstStart === -1 ? null : { firstStart, lastEnd };
}

/**
 * Tightest in-order subsequence span: first finds the earliest possible end
 * position (greedy left-to-right match), then the latest possible start
 * that still reaches that same end (greedy right-to-left match). Each pass
 * only walks `target` once — `ti`/`tj` never back up — so this is O(target
 * length) total, no per-character allocation.
 */
function subsequenceSpan(query: string, target: string): { start: number; end: number } | null {
    const qLen = query.length;
    const tLen = target.length;

    let ti = 0;
    let end = -1;
    for (let qi = 0; qi < qLen; qi++) {
        const code = query.charCodeAt(qi);
        let found = -1;
        while (ti < tLen) {
            const matched = target.charCodeAt(ti) === code;
            ti++;
            if (matched) {
                found = ti - 1;
                break;
            }
        }
        if (found === -1) return null;
        end = found;
    }

    let tj = end;
    let start = -1;
    for (let qi = qLen - 1; qi >= 0; qi--) {
        const code = query.charCodeAt(qi);
        let found = -1;
        while (tj >= 0) {
            const matched = target.charCodeAt(tj) === code;
            tj--;
            if (matched) {
                found = tj + 1;
                break;
            }
        }
        if (found === -1) return null;
        start = found;
    }

    return { start, end };
}

/**
 * Scores `target` against `query`. Both must already be normalized (see
 * `normalize.ts`) — neither is normalized here. Returns `null` when `target`
 * doesn't even satisfy the loosest (subsequence) tier.
 *
 * Higher scores rank first: exact > substring (earlier position wins) >
 * word-prefix > subsequence (tighter span wins), with a mild same-tier boost
 * for shorter targets throughout.
 */
export function fuzzyScore(query: string, target: string): number | null {
    if (query === target) return TIER_EXACT + lengthBonus(target.length);

    const substringAt = target.indexOf(query);
    if (substringAt !== -1) {
        return TIER_SUBSTRING + positionBonus(substringAt) + lengthBonus(target.length);
    }

    const prefixMatch = wordPrefixMatch(query, target);
    if (prefixMatch !== null) {
        const span = prefixMatch.lastEnd - prefixMatch.firstStart;
        return (
            TIER_WORD_PREFIX +
            positionBonus(prefixMatch.firstStart) +
            tightnessBonus(span) +
            lengthBonus(target.length)
        );
    }

    const subsequence = subsequenceSpan(query, target);
    if (subsequence !== null) {
        const span = subsequence.end - subsequence.start;
        return (
            TIER_SUBSEQUENCE +
            positionBonus(subsequence.start) +
            tightnessBonus(span) +
            lengthBonus(target.length)
        );
    }

    return null;
}

/** `rankSearch`'s default cap on results — generous for a dropdown/results pane; pass `Infinity` to get every match (e.g. for a "show all results" view). */
export const DEFAULT_SEARCH_LIMIT = 500;

/**
 * Scores every item in `items` against `query` and returns the matches, best
 * first. `getKey(item)` must return that item's already-normalized search
 * key — computed once when the item entered the catalog, not on every call —
 * `query` is the one thing normalized here, once, regardless of how many
 * items are ranked.
 *
 * Ties (equal score) keep their original relative order from `items`. Only
 * matches (`fuzzyScore` returning non-null) are included; pass
 * `limit: Infinity` to get all of them instead of the default cap.
 */
export function rankSearch<T>(
    query: string,
    items: readonly T[],
    getKey: (item: T) => string,
    limit: number = DEFAULT_SEARCH_LIMIT,
): T[] {
    const normalizedQuery = normalizeQueryOnce(query);

    const scored: Array<{ item: T; score: number; index: number }> = [];
    let index = 0;
    for (const item of items) {
        const score = fuzzyScore(normalizedQuery, getKey(item));
        if (score !== null) scored.push({ item, score, index });
        index++;
    }

    scored.sort((a, b) => b.score - a.score || a.index - b.index);

    const limited = Number.isFinite(limit) ? scored.slice(0, Math.max(0, limit)) : scored;
    return limited.map((entry) => entry.item);
}

// Kept as its own function (rather than inlining the import call site) so
// the one normalization this module performs is easy to spot in a diff —
// everything else here operates on strings the caller already normalized.
function normalizeQueryOnce(query: string): string {
    return normalizeForSearch(query);
}
