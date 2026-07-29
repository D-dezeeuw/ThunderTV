import { defineFn } from 'spektrum';
import { isLikelyDead } from '../health/score';
import { allHealthRecords, clearHealth } from '../health/store';
import { HEALTH_CLEARED, HEALTH_DEAD_COUNT, HEALTH_TRACKED_COUNT } from './health';
import { refreshLiveRows } from './live.actions';
import { set } from './typed';

/**
 * Settings → Diagnostics' stream-health surface (Phase 33, stone 3): a
 * readout of what has been learned, and the manual forget button.
 *
 * There is deliberately no "rebuild" counterpart to the EPG cache's
 * refresh: health can only be relearned by actually playing streams, so a
 * button promising to refresh it would be lying.
 */
export function registerHealthActions(): void {
    defineFn('settings/clearStreamHealth', () => {
        void forgetStreamHealth();
    });
}

/** Publishes the readout counts. Cheap (one pass over an in-memory map), so it runs on demand rather than being kept live. */
export function publishHealthCounts(): void {
    const nowMs = Date.now();
    const records = allHealthRecords();
    set(HEALTH_TRACKED_COUNT, records.length);
    set(HEALTH_DEAD_COUNT, records.filter((record) => isLikelyDead(record, nowMs)).length);
}

export async function forgetStreamHealth(): Promise<void> {
    await clearHealth();
    publishHealthCounts();
    set(HEALTH_CLEARED, true);
    // Rows carry an `unhealthy` marker from the enrichment pass, so the list
    // has to be rebuilt for the markers to actually disappear.
    refreshLiveRows();
}
