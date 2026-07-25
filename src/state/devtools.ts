import { describe, replay } from 'spektrum';

/**
 * Dev-only debugging helpers (Feature 05.7.3/05.7.4). Exports only —
 * nothing runs at import time — so `installDevtools()`'s call site can gate
 * behind `import.meta.env.DEV` and Vite's dead-code elimination drops this
 * whole module from the production bundle (verified in Feature 05.7.5 by
 * grepping the built `dist/` for `__tl`).
 */
export function installDevtools(): void {
    (window as unknown as { __tl: unknown }).__tl = {
        /** `__tl.replay(n)` — scrub state back to history index `n`; see `describe().historyLength` for the current bound. */
        replay: (n: number) => {
            replay(n);
        },
        /** `__tl.dumpState()` — the full Spektrum manifest (state, history length, registered systems/fns/refs/intents) for a debugging session. */
        dumpState: () => describe(),
    };
}
