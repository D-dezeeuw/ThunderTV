import { setValue } from 'spektrum';

export const EPG_TICK = 'epg.tick';

/** Masterplan §5.5: one global heartbeat instead of a timer per visible row. */
const TICK_INTERVAL_MS = 30_000;

let tickHandle: ReturnType<typeof setInterval> | undefined;

export function initEpgState(): void {
    setValue(EPG_TICK, Date.now());
}

/**
 * Starts the global tick — a sanctioned publisher (Feature 05.2.4): it
 * writes `epg.tick` directly, not through a `defineFn` action, because
 * nothing user-triggered causes it; it's driven by the clock.
 * `computed()` values depending on `epg.tick` recompute on each beat; rows
 * whose derived now/next didn't actually change don't re-render (Spektrum
 * dependency precision — masterplan §5.5).
 */
export function startEpgTick(): () => void {
    stopEpgTick();
    tickHandle = setInterval(() => {
        setValue(EPG_TICK, Date.now());
    }, TICK_INTERVAL_MS);
    return stopEpgTick;
}

export function stopEpgTick(): void {
    if (tickHandle !== undefined) {
        clearInterval(tickHandle);
        tickHandle = undefined;
    }
}
