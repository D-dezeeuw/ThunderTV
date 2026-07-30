import { appState, defineFn, getPathObj } from 'spektrum';
import type { Route } from '../app/router';
import { selectChannel } from './list.actions';
import { publishVariantsFor } from './live.actions';
import { PLAYER_ZAP_HISTORY } from './player';
import { setActiveChannel } from './player.actions';
import type { ActiveChannelSnapshot } from './records';

/**
 * Recents, made useful: a row you watched is a row you can go back to.
 *
 * A zap-history entry is a full `ActiveChannelSnapshot` — it carries the
 * stream URL — so replaying one needs no playlist loaded and no lookup
 * against the channel list. That is the whole point of the denormalized
 * snapshot (masterplan §6.4): Recents works on a cold boot, before any
 * source has finished loading.
 *
 * Lives in its own module rather than `player.actions.ts` because it needs
 * `live.actions.ts` for the variant strip, and `live.actions.ts` already
 * imports `player.actions.ts` — putting it there would close an import
 * cycle.
 */
export function registerRecentActions(): void {
    defineFn('recent/play', (el, _state, _delta, _value, event) => {
        const row = (event?.target as HTMLElement | undefined)?.closest<HTMLElement>('[data-id]') ?? el;
        const id = row.dataset['id'];
        if (id) playFromHistory(id);
    });
}

/** The view a snapshot belongs in — Radio is the only one with an audio layout. */
export function viewForSnapshot(snapshot: ActiveChannelSnapshot): Route {
    return snapshot.radio === true ? 'radio' : 'live';
}

/**
 * Replays a zap-history entry. The snapshot is the source of truth for the
 * stream; the variant strip is a best-effort extra — `publishVariantsFor()`
 * only finds alternates when the channel happens to be in the list that is
 * currently published, and correctly leaves the strip empty otherwise.
 */
export function playFromHistory(id: string): void {
    const history = getPathObj<ActiveChannelSnapshot[]>(appState, PLAYER_ZAP_HISTORY) ?? [];
    const snapshot = history.find((entry) => entry.id === id);
    if (!snapshot) return;

    publishVariantsFor(snapshot.id, snapshot.streamUrl);
    setActiveChannel(snapshot);
    // Move the list cursor onto it too, exactly as `playFavorite()` does.
    // Without this a replayed channel started playing but the target view's
    // list highlighted whatever row the cursor happened to be parked on —
    // which reads as "it jumped to the tab and nothing happened".
    selectChannel(snapshot.id);
    // Navigating last: the router owns `ui.activeView`, and the view it
    // lands on already has the channel playing when it paints.
    location.hash = `#/${viewForSnapshot(snapshot)}`;
}
