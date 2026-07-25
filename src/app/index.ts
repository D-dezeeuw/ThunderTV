import { bindDOM, computed, defineFn, run, setValue, type State } from 'spektrum';

interface SmokeState extends State {
    smoke?: { count?: number };
}

function readSmokeCount(state: State): number {
    return (state as SmokeState).smoke?.count ?? 0;
}

/**
 * Application bootstrap — the single place main.ts delegates to.
 *
 * Real boot order once the owning phases land:
 *   1. platform — detect Electron vs web, construct the PlatformAdapter (Phase 03)
 *   2. storage  — probe IndexedDB/localStorage/memory, pick a tier (Phase 04)
 *   3. connect  — parse a #/connect bookmark URL, if present, before render (Phase 14)
 *   4. render   — rehydrate persisted state, bindDOM(), run() (Phase 05 onward)
 *
 * Only step 4 exists today, as the Feature 01.10 smoke page (markup lives in
 * index.html's #app block). Steps 1-3 are no-ops until their owning phases
 * land, and the smoke page itself is removed once Phase 02's real app shell
 * replaces it.
 */
export function bootstrap(): void {
    setValue('smoke.message', 'ThunderTV is alive');
    setValue('smoke.count', 0);

    // computed(): derives smoke.parity from smoke.count and re-runs whenever
    // that dependency changes — proven by the bump button below.
    computed('smoke.parity', ['smoke.count'], (state: State) =>
        readSmokeCount(state) % 2 === 0 ? 'even' : 'odd',
    );

    // defineFn(): registers the handler index.html's data-action="click:bumpSmoke"
    // binds to.
    defineFn('bumpSmoke', (_el, state) => {
        setValue('smoke.count', readSmokeCount(state) + 1);
    });

    bindDOM();
    run();
}
