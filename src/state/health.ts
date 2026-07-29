import { setValue } from 'spektrum';

/**
 * Settings-facing projection of `src/health/`'s store (Phase 33, stone 3).
 * Counts only — the records themselves live in module memory and storage,
 * never in Spektrum state (they can run to thousands, far past the
 * bulk-data ceiling, and the channel list reads them synchronously).
 */
export const HEALTH_TRACKED_COUNT = 'settings.healthTrackedCount';
export const HEALTH_DEAD_COUNT = 'settings.healthDeadCount';
/** One-shot confirmation for the forget button — mirrors the EPG cache's done/failed feedback. */
export const HEALTH_CLEARED = 'settings.healthCleared';

export function initHealthState(): void {
    setValue(HEALTH_TRACKED_COUNT, 0);
    setValue(HEALTH_DEAD_COUNT, 0);
    setValue(HEALTH_CLEARED, false);
}
