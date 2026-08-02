import { defineFn, refs } from 'spektrum';
import type { Route } from '../app/router';
import {
    cancelSweep,
    isSweepRunning,
    isSweepWarm,
    runSweep,
    SWEEP_PUBLISH_INTERVAL_MS,
    sweepSources,
} from './catalog-sweep';
import {
    SEARCH_ALL_SOURCES,
    SEARCH_SWEEP_KIND,
    SEARCH_SWEEP_OPEN,
    SEARCH_SWEEP_PROGRESS,
    SEARCH_SWEEP_STATUS,
} from './search';
import { setSearchAllSources } from './search.actions';
import { SWEEP_PROGRESS_ZERO, type SweepKind, type SweepProgress, type SweepSource } from './sweep-plan';
import { get, set } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

/**
 * The "Search all" affordance and its warning/progress modal.
 *
 * The flow deliberately has two shapes, because the cost does:
 *
 * - **Warm cache** (every configured provider is inside the 24h catalog TTL
 *   — the usual case, since opening Movies warms the active one): the
 *   button just turns search-all on. The sweep still runs, but it is local
 *   reads only, so there is nothing to warn about and no modal appears.
 * - **Cold or stale cache**: the modal opens on `'confirm'` first. Nothing
 *   is fetched until the viewer presses Start, and Cancel aborts mid-request
 *   rather than mid-list — see `catalog-sweep.ts`.
 *
 * Which catalog is swept is read from `ui.activeView` at press time, the
 * same "resolve it from the view rather than from a picker" rule
 * `search.actions.ts`'s `search/setQueryChannels` already uses.
 */

/**
 * Mirrors `search.sweepKind` as a plain module variable for the same reason
 * `search.actions.ts` mirrors query/scope: `set()` only queues a write, and
 * `startSweep()` runs in the same tick as the `set()` that chose the kind,
 * so re-reading the key would see the previous value.
 */
let currentKind: SweepKind = 'vod';

export function registerSearchSweepActions(): void {
    defineFn('search/toggleAll', () => {
        void toggleSearchAll();
    });
    defineFn('search/startSweep', () => {
        void startSweep();
    });
    defineFn('search/cancelSweep', () => {
        cancelSweep(currentKind);
    });
    defineFn('search/closeSweep', () => {
        closeSweep();
    });
}

function kindForActiveView(): SweepKind {
    return get<Route>(UI_ACTIVE_VIEW) === 'series' ? 'series' : 'vod';
}

/**
 * The affordance itself. Turning search-all **off** is instant and local —
 * the pool is kept, so turning it back on within the TTL costs nothing.
 */
export async function toggleSearchAll(): Promise<void> {
    if (get<boolean>(SEARCH_ALL_SOURCES) === true) {
        setSearchAllSources(false);
        return;
    }

    const kind = kindForActiveView();
    currentKind = kind;
    set(SEARCH_SWEEP_KIND, kind);

    const sources = await sweepSources();
    // Nothing sweepable (no Xtream account configured at all): silently do
    // nothing rather than open a modal offering to search zero providers.
    if (sources.length === 0) return;

    if (await isSweepWarm(kind, sources)) {
        await sweep(kind, sources);
        return;
    }

    set(SEARCH_SWEEP_STATUS, 'confirm');
    set(SEARCH_SWEEP_PROGRESS, { ...SWEEP_PROGRESS_ZERO, sourcesTotal: sources.length });
    openModal();
}

/** Start, from the modal's own button — the point at which the viewer has actually consented to the fetching. Exported as a plain function, per Feature 05.2.7. */
export async function startSweep(): Promise<void> {
    if (isSweepRunning(currentKind)) return;
    const kind = currentKind;
    await sweep(kind, await sweepSources());
}

/**
 * Runs the sweep and publishes its progress, throttled. The terminal state
 * is always published unthrottled, so the modal can never be left showing a
 * stale count next to a finished sweep.
 */
async function sweep(kind: SweepKind, sources: readonly SweepSource[]): Promise<void> {
    set(SEARCH_SWEEP_STATUS, 'running');
    let lastPublishedAt = 0;
    const publish = (progress: SweepProgress): void => {
        const now = Date.now();
        if (now - lastPublishedAt < SWEEP_PUBLISH_INTERVAL_MS) return;
        lastPublishedAt = now;
        set(SEARCH_SWEEP_PROGRESS, progress);
    };

    const result = await runSweep(kind, sources, publish);
    set(SEARCH_SWEEP_PROGRESS, result.progress);
    set(SEARCH_SWEEP_STATUS, result.cancelled ? 'cancelled' : 'done');
    // On even a partly-swept pool the results are strictly wider than the
    // single-source ones, so search-all goes on either way — how complete it
    // is, is what `SweepProgress.partial` is for.
    setSearchAllSources(true, result.progress.partial);
}

/**
 * Closing while a sweep is running cancels it. A sweep with no visible
 * progress is worse than no sweep: it keeps hitting the provider for
 * minutes with nothing on screen saying so, and nothing left to press
 * Cancel on.
 */
export function closeSweep(): void {
    cancelSweep(currentKind);
    set(SEARCH_SWEEP_OPEN, false);
}

/** Double-rAF for the same reason `ui.actions.ts`'s `focusAfterOpen()` uses one: `data-if`'s display flip lands on Spektrum's next tick, and a hidden element cannot take focus. */
function openModal(): void {
    set(SEARCH_SWEEP_OPEN, true);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            (refs['sweepModal'] as HTMLElement | undefined)?.focus();
        });
    });
}

/** Test-only. @internal */
export function resetSearchSweepActionsForTests(): void {
    currentKind = 'vod';
}
