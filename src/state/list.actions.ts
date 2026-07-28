import { defineFn, setValue } from 'spektrum';
import { wasJustLongPressed } from '../ui/long-press';
import { ensureIndexVisible, findRowById, indexOfRow, rowAt, rowCount } from '../ui/virtual-list';
import { toggleFavoriteById } from './favorites.actions';
import { LIST_SELECTED_ID } from './list';
import { saveListState } from './list-state-sync';
import { publishVariantsFor } from './live.actions';
import { setActiveChannel } from './player.actions';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { get } from './typed';

/**
 * Selection (Feature 08.7) and its keyboard/pointer dispatch. Selection
 * (where the keyboard is) and `player.active` (what is playing, Phase 10's
 * state) are deliberately distinct — a row can carry both classes at once,
 * matching Feature 08.7.3.
 */
export function registerListActions(): void {
    // Feature 08.7.1: bound on the `.rows` container for delegation (one
    // listener, not one per row) — Spektrum's `data-action` always passes
    // the *bound* element as `el` (confirmed against the vendored engine's
    // `re()` binder, which closes over its own `t`, never `event.target`),
    // so the actually-clicked row must be resolved from the raw event
    // instead — same `.closest('[data-id]')` pattern already used by the
    // plain-JS contextmenu/long-press delegation in `list-bindings.ts`.
    defineFn('list/selectChannel', (_el, _state, _delta, _value, event) => {
        const row = (event?.target as HTMLElement | undefined)?.closest<HTMLElement>('.channel-row[data-id]');
        const id = row?.dataset['id'];
        if (id) handleRowTap(id);
    });

    defineFn('list/handleListKeydown', (_el, _state, _delta, _value, event) => {
        handleListKeydown(event as KeyboardEvent | undefined);
    });

    defineFn('list/playSelected', () => {
        playSelected();
    });
}

/**
 * Feature 08.8.1: `contextmenu` on a row toggles its favorite — bound via a
 * plain delegated `addEventListener` in `src/ui/list-bindings.ts`, not a
 * `data-action`/`data-fn` pair: Spektrum allows only one such pair per
 * element, and the rows container's pair is already spent on
 * `click`/`list/selectChannel` (same one-pair-per-element constraint Phase
 * 07 hit for drag-and-drop, see `bootstrap.ts`'s `registerImportDropzoneDragover()`).
 */
export function handleRowContextMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    // Feature 08.8.8: a touch device's own long-press may already have
    // fired a native `contextmenu` for this same gesture — skip so one
    // physical press never nets a double toggle.
    if (wasJustLongPressed()) return;
    void toggleFavoriteById(id);
}

/** Sets the selection cursor and persists it into the active source's saved list state (Feature 08.7.2/08.7.8). Exported for direct calls (keyboard nav, selection invalidation) — Feature 05.2.7's "actions are plain, directly callable functions." */
export function selectChannel(id: string | null): void {
    setValue(LIST_SELECTED_ID, id);
    const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
    if (sourceId) saveListState(sourceId, { selectedId: id });
}

/**
 * The row click/tap entry: selects AND plays, on every pointer type. This
 * was originally gated to coarse (touch) pointers with desktop kept on
 * click-selects/Enter-plays — which left mouse users with a click that
 * visibly did nothing and no discoverable way to start a stream. Click-to-
 * play is the universal IPTV convention; keyboard users keep Arrow/Enter
 * (`handleListKeydown`), and click-drag scrolling never fires `click`, so
 * a deliberate click is safe to treat as "watch this". `id` is passed
 * explicitly rather than re-read from `LIST_SELECTED_ID` because `setValue`
 * writes only become readable after the next tick (the established
 * `set()`/`tick()` pitfall).
 */
export function handleRowTap(id: string): void {
    selectChannel(id);
    playChannelById(id);
}

/** Feature 08.7.4: moves selection over the current row order (filtered or full) and scrolls only as needed to keep it visible. */
export function moveSelection(delta: 1 | -1): void {
    const total = rowCount();
    if (total === 0) return;

    const currentId = get<string | null>(LIST_SELECTED_ID);
    const currentIndex = currentId ? indexOfRow(currentId) : -1;
    const base = currentIndex === -1 ? (delta > 0 ? -1 : total) : currentIndex;
    const nextIndex = Math.min(Math.max(base + delta, 0), total - 1);

    const nextRow = rowAt(nextIndex);
    if (!nextRow) return;
    selectChannel(nextRow.id);
    ensureIndexVisible(nextIndex);
}

/** Feature 08.7.5: Enter plays the selected row via the real, already-built `setActiveChannel` action (Phase 05's §6.3 body — zap history + persistence already work, ahead of Phase 10's full player wiring). */
export function playSelected(): void {
    const id = get<string | null>(LIST_SELECTED_ID);
    if (id) playChannelById(id);
}

/** Builds and publishes the active-channel snapshot for a specific row id — shared by Enter-to-play and the mobile tap-to-play path. */
export function playChannelById(id: string): void {
    const sourceId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
    if (!sourceId) return;
    const row = findRowById(id);
    if (!row) return;
    // Publish the alternate feeds first: the player dock reacts to
    // `setActiveChannel`, so the variant strip must already be correct by
    // the time the new channel paints.
    publishVariantsFor(id, row.url);
    setActiveChannel({
        id: row.id,
        sourceId,
        name: row.name,
        streamUrl: row.url,
        logo: row.logo,
        group: row.group,
        radio: row.radio,
    });
}

function toggleFavoriteSelected(): void {
    const id = get<string | null>(LIST_SELECTED_ID);
    if (id) void toggleFavoriteById(id);
}

/**
 * The one `keydown` handler bound on the rows container (`data-action="keydown"`,
 * no built-in Spektrum key filter exists for arrow keys — only
 * `enter`/`esc`/`tab`/`shift`/`cmd` are matchable via `data-action` modifier
 * tokens, confirmed against the vendored engine). Inspects the raw
 * `KeyboardEvent` by hand, same mechanism as Phase 07's Ctrl+Enter paste
 * shortcut.
 */
export function handleListKeydown(event: KeyboardEvent | undefined): void {
    if (!event) return;
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            moveSelection(1);
            return;
        case 'ArrowUp':
            event.preventDefault();
            moveSelection(-1);
            return;
        case 'Enter':
            event.preventDefault();
            playSelected();
            return;
        case 'f':
        case 'F':
            event.preventDefault();
            toggleFavoriteSelected();
            return;
        default:
            return;
    }
}
