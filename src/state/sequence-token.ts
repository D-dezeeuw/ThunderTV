/**
 * A tiny in-memory "is this still the latest request" guard for an async
 * flow that writes its subject to Spektrum state before awaiting the
 * network (`vod.actions.ts`'s `selectVodCategory()`/`openVodDetail()`,
 * `series.actions.ts`'s equivalents).
 *
 * **Why not just re-read the Spektrum key the flow itself just wrote?**
 * `state/typed.ts`'s `set()`/`replace()` queue a write; nothing is visible
 * to `get()` until the next `tick()` drains it (production: `run()`'s rAF
 * loop; tests: an explicit `tick()`). A same-function `set(key, x)` followed
 * later (after an `await`) by `get(key) !== x` is only reliable if *some*
 * tick happened to land in between — true almost always in production
 * (a network round-trip outlasts one rAF frame) but not guaranteed, and
 * false by construction in a synchronous-fake-HTTP unit test with no rAF
 * loop running at all. A plain module-level counter sidesteps the tick
 * queue entirely: `begin()` increments and reads back synchronously, so
 * "is my token still current" is correct regardless of whether anything
 * ever ticks.
 */
export interface SequenceToken {
    /** Call once at the start of a new attempt — returns the token to check later. */
    begin: () => number;
    /** True when `token` is still the most recently begun attempt. */
    isCurrent: (token: number) => boolean;
}

export function createSequenceToken(): SequenceToken {
    let current = 0;
    return {
        begin: () => (current += 1),
        isCurrent: (token) => token === current,
    };
}
