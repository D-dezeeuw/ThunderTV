import { setValue } from 'spektrum';

/**
 * A 1×1 fully transparent GIF, seeded into state as `blankImage` so markup
 * can write `:src="item.logo || blankImage"`.
 *
 * Why this exists: Spektrum removes an attribute when its bound value is
 * `null` **only for hyphenated attribute names** (`:aria-current` takes the
 * `setAttribute`/`removeAttribute` path). Everything else goes through the
 * DOM *property* — `img.src = undefined` — which the browser stringifies to
 * the literal `"undefined"` and then fetches, producing a wasted request and
 * a 404 for every logo-less row. The `<img>` is already hidden by its own
 * `data-if` and a sibling `.channel-row__logo-placeholder` draws the real
 * fallback glyph, so that request bought nothing.
 *
 * A data URI is the fix rather than `''` or `null`: an empty `src` resolves
 * to the *document* URL and is fetched too, and `null` stringifies to
 * `"null"` for exactly the same reason `undefined` does.
 *
 * Outside `KEY_REGISTRY` (listed in `NON_REGISTRY_KEYS` beside `strings`):
 * static reference data, never a mutation, never a persistence candidate.
 */
export const BLANK_IMAGE_KEY = 'blankImage';

export const BLANK_IMAGE =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function seedBlankImage(): void {
    setValue(BLANK_IMAGE_KEY, BLANK_IMAGE);
}
