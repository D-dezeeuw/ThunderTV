import type { Direction } from './geometry';

/**
 * TV remotes are keyboards that lie about it — Vision 3.0's stone 8 in its
 * least glamorous form.
 *
 * `KeyboardEvent.key` is well-behaved on desktop and inconsistent on TV
 * webviews: webOS reports the standard arrow names but sends its Back
 * button as a non-standard `keyCode` with no useful `key` at all, and older
 * Tizen/webOS builds route the colour and media buttons through numeric
 * codes only. So both are consulted, `key` first.
 */

const KEY_DIRECTIONS: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    // Some older webviews report the pre-DOM4 names.
    Up: 'up',
    Down: 'down',
    Left: 'left',
    Right: 'right',
};

/** Legacy numeric fallbacks, only consulted when `key` says nothing useful. */
const CODE_DIRECTIONS: Record<number, Direction> = {
    38: 'up',
    40: 'down',
    37: 'left',
    39: 'right',
};

/**
 * webOS's remote Back button. Not in any standard: 461 is LG's own code,
 * and 10009 is Tizen's — both are included because a TV build that
 * mishandles Back is one a user cannot navigate out of.
 */
const BACK_KEY_CODES = new Set([461, 10009]);
const BACK_KEY_NAMES = new Set(['Backspace', 'BrowserBack', 'GoBack', 'XF86Back']);

export function directionFor(event: KeyboardEvent): Direction | null {
    return KEY_DIRECTIONS[event.key] ?? CODE_DIRECTIONS[event.keyCode] ?? null;
}

/** Enter and the remote's centre/OK button both activate. `Space` deliberately does not — it is the play/pause shortcut everywhere else in the app. */
export function isActivateKey(event: KeyboardEvent): boolean {
    return event.key === 'Enter' || event.keyCode === 13;
}

export function isBackKey(event: KeyboardEvent): boolean {
    return BACK_KEY_NAMES.has(event.key) || BACK_KEY_CODES.has(event.keyCode);
}

/**
 * A modified press is never spatial navigation — Shift+Arrow selects text,
 * Alt+Arrow is browser history, Ctrl/Cmd+Arrow is a word/line jump. Letting
 * those move focus would break behaviour a desktop user relies on, for a
 * gesture no remote can even produce.
 */
export function hasModifier(event: KeyboardEvent): boolean {
    return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}
