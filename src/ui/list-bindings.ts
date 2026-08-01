import { refs, watch } from 'spektrum';
import { EPG_TICK } from '../state/epg';
import { toggleFavoriteById } from '../state/favorites.actions';
import { handleRowContextMenu } from '../state/list.actions';
import { consumeHandoff } from '../state/handoff.actions';
import { loadActiveSource, registerActiveSourceWatch } from '../state/list-load';
import { isGridLayout, layoutScopeForRoute, UI_LIST_LAYOUT, type ListLayoutMap } from '../state/list-layout';
import { UI_VIEW_MODE } from '../state/list-state';
import { UI_ACTIVE_VIEW } from '../state/ui';
import { registerViewRowsWatch } from '../state/live.actions';
import { saveListState } from '../state/list-state-sync';
import { PLAYLIST_ACTIVE_SOURCE_ID } from '../state/playlist';
import { get } from '../state/typed';
import type { Density } from './density';
import type { TileShape } from './grid-metrics';
import { attachLongPress } from './long-press';
import { attachLogoFallback } from './logo-fallback';
import { attachContainer, republishWindow, setDensity, setGridMode } from './virtual-list';

const SCROLL_SETTLE_MS = 300;

/**
 * Wires the real list DOM to the windowing controller — called once, post-
 * `bindDOM()`/`run()` (`bootstrap.ts`), mirroring
 * `registerImportDropzoneDragover()`'s pattern (Feature 07.2.7). The list
 * container is structurally always present (only CSS-hidden via `data-if`
 * when no source is active), so `refs['listContainer']` is populated at this
 * point regardless of whether a source is active yet — Spektrum's `data-if`
 * toggles visibility on an already-bound node rather than destroying and
 * recreating it (confirmed by the existing settings-panel's
 * `data-ref`-inside-`data-if` usage), so this wiring survives every later
 * show/hide.
 */
/**
 * `onInitialLoad`, if given, fires once the same initial `loadActiveSource()`
 * `consumeHandoff()` already waits for settles — the boot splash's only
 * "the Live list has real rows now" signal (`src/state/boot.ts`'s
 * `markChannelDataReady()`), independent of whether a handoff was pending.
 */
export function registerListBindings(onInitialLoad?: () => void): () => void {
    const cleanups: Array<() => void> = [];

    cleanups.push(
        watch(['ui.density'], (state) => {
            const density = (state as { ui?: { density?: Density } }).ui?.density;
            if (density) setDensity(density);
        }),
    );

    const scrollContainer = refs['listContainer'] as HTMLElement | undefined;
    if (scrollContainer) {
        cleanups.push(attachContainer(scrollContainer));
        cleanups.push(attachScrollPersistence(scrollContainer));
    }

    // The list/grid switch, and every view change that could reveal a
    // different view's saved choice. Watched after `attachContainer()` so the
    // controller has a real container to measure a column count from —
    // `setGridMode()` re-derives it on every resize afterwards.
    cleanups.push(
        watch([UI_LIST_LAYOUT, UI_ACTIVE_VIEW], (state) => {
            setGridMode(tileShapeFor(state));
        }),
    );

    const rowsContainer = refs['rowsContainer'] as HTMLElement | undefined;
    if (rowsContainer) {
        cleanups.push(
            attachLongPress(rowsContainer, resolveRowElement, {
                onLongPress: (row) => {
                    const id = row.dataset['id'];
                    if (id) void toggleFavoriteById(id);
                },
            }),
        );

        // Feature 08.8.1/08.7.6: contextmenu (favorite toggle) and dblclick
        // (reserved Phase 12 no-op — deliberately no handler at all) both
        // need the click binding's container, but Spektrum allows only one
        // data-action/data-fn pair per element (see handleRowContextMenu()'s
        // own comment) — delegated here in plain JS instead.
        const onContextMenu = (event: MouseEvent): void => {
            const row = resolveRowElement(event.target as HTMLElement);
            const id = row?.dataset['id'];
            if (id) handleRowContextMenu(event, id);
        };
        rowsContainer.addEventListener('contextmenu', onContextMenu);
        cleanups.push(() => rowsContainer.removeEventListener('contextmenu', onContextMenu));

        cleanups.push(attachLogoFallback(rowsContainer));
    }

    // An arriving handoff (stone 9) resolves against loaded rows, so it has
    // to wait for the boot load rather than race it — this is the one place
    // that knows when those rows exist.
    //
    // The catch sits *before* the continuation so `onInitialLoad` runs on
    // both paths: it resolves `channelDataReady`, which the boot splash
    // waits on, and a failed initial load would otherwise leave the splash
    // up permanently over the error the user needs to see.
    void loadActiveSource()
        .catch((error: unknown) => {
            console.error('[ThunderTV] boot: the initial channel load failed', error);
        })
        .then(() => {
            void consumeHandoff();
            onInitialLoad?.();
        });
    cleanups.push(registerActiveSourceWatch());
    // Live and Categories share this one virtual list, so moving between
    // them — or changing a Live filter setting — republishes a different
    // row set into it rather than mounting a second list.
    cleanups.push(registerViewRowsWatch());

    // The global 30s heartbeat re-enriches the visible slice's now/next line
    // and progress bars (masterplan §5.5). Watched here rather than inside
    // `src/state/` because the republish entry point lives in the windowing
    // controller — and `src/state/**` must never import from `src/ui/`
    // (state/README.md's layering rule); this direction is the sanctioned one.
    cleanups.push(watch([EPG_TICK], () => republishWindow()));

    return () => cleanups.forEach((cleanup) => cleanup());
}

/**
 * Which tile shape the active view's grid uses, or `null` when it is showing
 * the list. Movies and TV Shows ship 2:3 posters; a channel logo is roughly
 * square, and stretching it into a poster frame would be mostly empty box.
 */
function tileShapeFor(state: unknown): TileShape | null {
    const ui = (state as { ui?: { listLayout?: Partial<ListLayoutMap>; activeView?: string } }).ui;
    if (!isGridLayout(ui?.listLayout, ui?.activeView)) return null;
    return layoutScopeForRoute(ui?.activeView) === 'live' ? 'square' : 'poster';
}

function resolveRowElement(eventTarget: HTMLElement): HTMLElement | null {
    return eventTarget.closest<HTMLElement>('.channel-row[data-id]');
}

/** Feature 08.6.3: samples `scrollTop` once, ~300ms after the last scroll event settles — never on every frame, keeping both Spektrum's history and the persistence bridge quiet (§5.8). */
function attachScrollPersistence(container: HTMLElement): () => void {
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const onScroll = (): void => {
        if (settleTimer !== null) clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
            settleTimer = null;
            const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
            if (!sourceId) return;
            const viewMode = get<string>(UI_VIEW_MODE);
            const scrollTop = container.scrollTop;
            saveListState(sourceId, viewMode === 'groups' ? { groupScrollTop: scrollTop } : { scrollTop });
        }, SCROLL_SETTLE_MS);
    };

    container.addEventListener('scroll', onScroll);
    return () => {
        container.removeEventListener('scroll', onScroll);
        if (settleTimer !== null) clearTimeout(settleTimer);
    };
}
