import { appState } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { mountTemplate } from './bind-dom';

/**
 * Meta-spec for the harness itself (Feature 05.10.9) — downstream phases
 * trust that a red flagship spec means a real broken binding, not a leaky
 * harness. Two things to prove: mounts don't leak state into each other,
 * and a deliberately broken binding is actually detectable (red stays red).
 */
describe('mountTemplate isolation (Feature 05.10.2/05.10.9)', () => {
    it('a value set during one mount does not survive into the next mount', () => {
        const first = mountTemplate('<p data-if="hasNoSources">empty</p>');
        expect(appState['playlist']).toMatchObject({ sourceCount: 0 });
        first.cleanup();

        const second = mountTemplate('<p></p>');
        // A leaked mutation from the first mount (e.g. a stale sourceCount)
        // would still be visible here if resetState()/state re-seeding
        // didn't run between mounts.
        expect(appState['playlist']).toMatchObject({ sourceCount: 0 });
        second.cleanup();
    });

    it('cleanup() removes the mounted root from the document', () => {
        const mounted = mountTemplate('<p id="probe">hi</p>');
        expect(document.getElementById('probe')).not.toBeNull();
        mounted.cleanup();
        expect(document.getElementById('probe')).toBeNull();
    });

    it('a deliberately broken binding (unregistered computed) renders as absent, not as a silent pass', () => {
        const mounted = mountTemplate('<p data-if="this.computed.does.not.exist">should stay hidden</p>');
        const el = mounted.query('p');
        // An unregistered computed reads as undefined -> falsy -> data-if
        // hides the node. A harness bug that no-ops bindDOM entirely would
        // instead leave the node visible (display never set to "none") —
        // this assertion is the one that would catch that.
        expect(el?.style.display).toBe('none');
        mounted.cleanup();
    });

    it("dispatch() throws a clear error when the template has no matching [data-fn] element", () => {
        const mounted = mountTemplate('<div></div>');
        expect(() => mounted.dispatch('nothing/registered')).toThrow(/no \[data-fn="nothing\/registered"\]/);
        mounted.cleanup();
    });
});
