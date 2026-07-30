import { findNext, type Candidate, type Direction } from './geometry';
import { directionFor, hasModifier, isActivateKey, isBackKey } from './keys';

/**
 * The DOM half of spatial navigation (stone 8) — collecting what can be
 * focused, deciding whether this press is ours, and moving focus.
 *
 * Two design rules keep this from fighting the rest of the app:
 *
 * 1. **Never take a press a control already handles.** A `<select>`,
 *    text input, or the channel list's own up/down row cursor all use
 *    arrow keys meaningfully. This handler bails on those rather than
 *    competing, so desktop behaviour is completely unchanged.
 * 2. **Never wrap around.** A press with nothing in that direction does
 *    nothing. On a 10-foot screen, focus silently teleporting from top to
 *    bottom is far more disorienting than a press that no-ops.
 */

/**
 * What counts as a focus target. Everything the app already renders as
 * interactive — no `tabindex` authoring required, which is the point:
 * spatial navigation should not need a hand-maintained focus map per
 * screen (that is exactly the Tab-order approach it replaces).
 */
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Controls whose own arrow-key behaviour must win over navigation. */
const SELF_HANDLING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Containers that run their own vertical cursor: the channel list
 * (`src/state/list.actions.ts`'s `handleListKeydown`) and the group/category
 * rail beside it (`src/state/groups.actions.ts`'s
 * `handleCategoryRailKeydown`). Vertical presses inside these belong to that
 * cursor; horizontal ones are how you get *out*, which nothing else
 * provides.
 *
 * The rail was missing here, and both handlers ran on one press: this one
 * moved focus a row (capture phase, `document`), then the rail's own
 * bubble-phase handler moved it a second row from there. One press, two
 * rows — every other row silently unreachable on a remote.
 */
const SELF_CURSOR_SELECTOR = '.list, .groups-panel';

function isVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    // `data-if` toggles `display`, so a hidden view's controls are still in
    // the document and would otherwise be perfectly good focus targets.
    return element.checkVisibility?.({ visibilityProperty: true, contentVisibilityAuto: true }) ?? true;
}

/**
 * Every modal (settings, wizard, debug panel, the audio/subtitle track
 * menus, the VOD/series detail panels) marks its container `role="dialog"`
 * — this module stays state-agnostic (it never imports `src/state/*`) so
 * it can't ask "is the settings panel open," but it can ask the DOM the
 * same question `isVisible()` already answers for individual controls.
 */
const DIALOG_SELECTOR = '[role="dialog"]';

/**
 * When at least one dialog is open, background content (the rail, the
 * channel list, anything behind the dialog's backdrop) must never become a
 * focus candidate — those overlays render *on top of* the still-mounted
 * main view rather than hiding it, so without this a press could land
 * D-pad focus on a control the viewer can't see. webOS App Self Checklist
 * item 4 ("every selectable object shows a selection effect") only holds
 * if the focused thing is ever visible in the first place.
 */
function openDialogs(root: ParentNode): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)).filter(isVisible);
}

function collectCandidates(root: ParentNode, exclude: Element | null): Candidate<HTMLElement>[] {
    const dialogs = openDialogs(root);
    const candidates: Candidate<HTMLElement>[] = [];
    for (const element of root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
        if (element === exclude || !isVisible(element)) continue;
        if (dialogs.length > 0 && !dialogs.some((dialog) => dialog.contains(element))) continue;
        const rect = element.getBoundingClientRect();
        candidates.push({ ref: element, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } });
    }
    return candidates;
}

/** True when this press should be left entirely to the focused control. */
function shouldDefer(active: HTMLElement, direction: Direction): boolean {
    if (SELF_HANDLING.has(active.tagName)) return true;
    if (active.isContentEditable) return true;
    const ownsCursor = active.closest(SELF_CURSOR_SELECTOR) !== null;
    return ownsCursor && (direction === 'up' || direction === 'down');
}

export interface SpatialNavigationOptions {
    /** Where to search. Defaults to the document — narrowed in tests. */
    root?: ParentNode;
    /** Invoked for a remote Back press; return true if it was handled. */
    onBack?: () => boolean;
}

/**
 * Installs the handler. Returns a cleanup function, matching every other
 * `register*` in `src/ui/`.
 *
 * Bound on `document` in the capture phase so it sees a press before the
 * app's own per-container handlers, and can therefore decide to *defer*
 * (rule 1 above) rather than having to undo something already done.
 */
export function registerSpatialNavigation(options: SpatialNavigationOptions = {}): () => void {
    const root = options.root ?? document;

    const onKeydown = (event: KeyboardEvent): void => {
        if (hasModifier(event)) return;

        const active = document.activeElement;
        const activeElement = active instanceof HTMLElement && active !== document.body ? active : null;

        if (isBackKey(event)) {
            if (options.onBack?.()) event.preventDefault();
            return;
        }

        if (isActivateKey(event)) {
            // Buttons and links already activate on Enter natively; only a
            // generic `[tabindex]` element needs the synthetic click.
            if (activeElement && !SELF_HANDLING.has(activeElement.tagName) && activeElement.tagName !== 'BUTTON' && activeElement.tagName !== 'A') {
                activeElement.click();
                event.preventDefault();
            }
            return;
        }

        const direction = directionFor(event);
        if (!direction) return;
        if (activeElement && shouldDefer(activeElement, direction)) return;

        const origin = activeElement?.getBoundingClientRect() ?? firstEntryRect();
        const candidates = collectCandidates(root, activeElement);
        const next = findNext(
            { left: origin.left, top: origin.top, right: origin.right, bottom: origin.bottom },
            candidates,
            direction,
        );
        if (!next) return;

        next.focus();
        // Keeps a target that scrolled off-screen actually visible. `block:
        // 'nearest'` rather than centring: centring yanks the whole list on
        // every single step, which reads as the page fighting the user.
        next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        event.preventDefault();
    };

    document.addEventListener('keydown', onKeydown, true);
    return () => document.removeEventListener('keydown', onKeydown, true);
}

/**
 * Where navigation starts when nothing is focused yet — the top-left of the
 * viewport, so the first press lands on whatever is nearest the origin
 * rather than in an arbitrary corner. A zero-size rect at (0,0) is
 * deliberate: every real candidate is "ahead" of it in every direction.
 */
function firstEntryRect(): DOMRect {
    return new DOMRect(0, 0, 0, 0);
}
