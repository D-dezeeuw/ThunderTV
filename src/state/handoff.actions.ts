import { defineFn } from 'spektrum';
import { HANDOFF_ROUTE } from '../handoff/link';
import { HANDOFF_LINK, HANDOFF_MESSAGE, HANDOFF_STATE } from './handoff';
import { set } from './typed';

/**
 * Handing a session to another screen — the boot-path half.
 *
 * Producing or resolving a handoff needs the link codec, the session
 * resolver, the channel memory and the player's activation path; all of it
 * lives in `handoff.run.ts`, behind the same shim shape
 * `subtitle-search.actions.ts` documents. Nothing here is reachable until
 * the player bar's Handoff button is pressed, or a `#/handoff?h=…` link is
 * opened — and the arrival check below is a string test on `location.hash`,
 * so an ordinary boot never fetches the chunk at all.
 */

/** The one piece of state the shim owns: dismissing a panel must work whether or not the chunk ever loaded. */
function reportIdle(): void {
    set(HANDOFF_STATE, 'idle');
    set(HANDOFF_MESSAGE, '');
    set(HANDOFF_LINK, '');
}

export function registerHandoffActions(): void {
    defineFn('handoff/offer', () => {
        void import('./handoff.run').then((module) => module.offerHandoff());
    });
    defineFn('handoff/dismiss', () => {
        reportIdle();
    });
}

/**
 * Reads a handoff out of the current URL and plays it. Returns true when one
 * was present, so boot can skip the normal restore rather than starting the
 * previous channel and then yanking to this one.
 *
 * The hash test duplicates the first line of `handoffFromHash()` on purpose.
 * `consumeHandoff()` runs on every boot the moment rows land
 * (`src/ui/list-bindings.ts`), and the answer is "no" for every boot that
 * did not come from a handoff link — asking the question must not cost a
 * network round trip on a TV. Deliberately loose: it only decides whether
 * to look properly, and `handoffFromHash()` still does the real parse.
 */
export async function consumeHandoff(): Promise<boolean> {
    if (!location.hash.replace(/^#\/?/, '').startsWith(`${HANDOFF_ROUTE}?`)) return false;
    const module = await import('./handoff.run');
    return module.consumeHandoff();
}
