/**
 * Search-key normalization. One job: turn whatever a provider calls a row
 * into a string two callers can compare with `===`-grade confidence, no
 * matter how the source dressed it up.
 *
 *     ┃NL┃ NPO 1 HD  ⏺ʳᵉᶜ        → "nl npo 1 hd"
 *     ┃USA┃ 24/7 | MOVIES        → "usa 24 7 movies"
 *     Avengers: Endgame (2019)   → "avengers endgame 2019 4k"
 *     König der Löwen            → "konig der lowen"
 *
 * Diacritics fold via Unicode decomposition (NFD splits "ö" into "o" + a
 * combining diaeresis mark, which is then discarded). Everything that is
 * not a plain letter or digit — box-drawing bars, pipes, colons, the
 * recording glyph, superscript modifier letters, punctuation of every
 * script — collapses to a single space. The dropped superscript `ʳᵉᶜ` in
 * the first example above is deliberate: those modifier-letter glyphs are
 * how providers *decorate* a recording/quality flag, not how a viewer would
 * type it, and `src/channels/name-parse.ts` already turns that same glyph
 * into the structured `isRecording` flag for anything that needs it as data
 * — this module only ever needs to produce a comparison key, not re-parse
 * the flag.
 *
 * This module does no scoring and no ranking; see `fuzzy.ts` for that.
 * It also renders no user-visible text, so it carries none of the app's
 * string-table rule.
 */

/**
 * Matches Unicode combining marks left behind after NFD decomposition
 * (category Mn — "Nonspacing_Mark"). Kept as a small standalone regex
 * (rather than folded into the "non-alphanumeric" pass below) because it
 * must run *between* the `normalize('NFD')` call and the alphanumeric
 * collapse: collapsing first would turn "e" + combining-acute into "e "
 * instead of "e".
 */
const COMBINING_MARKS = /\p{M}/gu;

/**
 * Everything that is not a "real" letter or digit — kept categories are
 * Lu/Ll/Lt (cased letters), Lo (letters in scripts with no case, e.g. CJK,
 * Arabic, Hebrew, Thai — genuine base letters, not decoration), and N
 * (digits, including superscript/subscript digit code points). Deliberately
 * *excluded*: Lm ("modifier letter"), the category `┃`-adjacent superscript
 * glyphs like `ʳᵉᶜ` and `ᴴᴰ` live in — providers use them typographically,
 * the same role box-drawing and punctuation play, so they collapse to a
 * space right along with those rather than surviving as letters. A provider
 * inventing yet another decoration glyph falls into one of the excluded
 * symbol/punctuation categories automatically; there is no fixed glyph list
 * to maintain (contrast `name-parse.ts`, which *does* enumerate glyphs
 * because it needs their structured meaning, not just their absence).
 */
const NON_ALPHANUMERIC = /[^\p{Lu}\p{Ll}\p{Lt}\p{Lo}\p{N}]+/gu;

const EXTRA_WHITESPACE = /\s+/g;

/**
 * Normalizes `input` into a search key: lowercase, diacritics folded,
 * every non-alphanumeric run mapped to one space, trimmed.
 *
 * Cheap enough to run once per row at catalog-load time for ~20k rows
 * (three regex passes plus a `toLowerCase`/`normalize`, no per-character
 * work) — see `fuzzy.spec.ts`'s benchmark for a measured budget. Never
 * call this per keystroke on a stored key; normalize the *query* once per
 * search instead (`fuzzy.ts`'s `rankSearch` already does this) and compare
 * against keys normalized ahead of time.
 */
export function normalizeForSearch(input: string): string {
    const folded = input.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');
    const collapsed = folded.replace(NON_ALPHANUMERIC, ' ');
    return collapsed.replace(EXTRA_WHITESPACE, ' ').trim();
}
