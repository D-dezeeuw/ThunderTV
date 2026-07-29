import { appState, defineFn, getPathObj } from 'spektrum';
import { DEFAULT_ROUTE } from '../app/router';
import { strings } from '../app/strings';
import { handoffFromHash, handoffUrl } from '../handoff/link';
import { resolveHandoff, sessionFor } from '../handoff/resolve';
import { resumePositionFor } from '../handoff/session';
import { getRows } from '../m3u/channel-memory';
import { currentPositionSec, rememberPosition } from '../player/position';
import { HANDOFF_LINK, HANDOFF_MESSAGE, HANDOFF_STATE, type HandoffUiState } from './handoff';
import { PLAYER_ACTIVE } from './player';
import { setActiveChannel } from './player.actions';
import { loadActiveSource } from './list-load';
import { PLAYLIST_ACTIVE_SOURCE_ID, PLAYLIST_SOURCES } from './playlist';
import { setActiveSourceId } from './playlist.actions';
import type { ActiveChannelSnapshot } from './records';
import { viewForSnapshot } from './recent.actions';
import { get, set } from './typed';

/**
 * Handing a session to another screen, and catching one — stone 9.
 *
 * ## The transport, honestly
 *
 * The vision asks for handoff "over the local network only". A static page
 * cannot do the LAN half: a browser has no listening socket and no way to be
 * discovered, and WebRTC needs signalling — a server, which the "static
 * forever" invariant forbids outright. A real LAN transport therefore needs
 * a host that can listen, which means the Electron shell, and that is not
 * built. What is built is the part every host can do: the session travels in
 * a URL fragment the user hands over themselves.
 *
 * That is a weaker mechanism than the vision describes and a stronger one
 * than it sounds. The fragment never leaves the browser — not in a request,
 * not in a proxy log — the payload carries no credential and no stream
 * address, and it works between two devices that cannot see each other on
 * any network at all.
 *
 * ## Consume and scrub
 *
 * An arriving handoff is read once and then removed from the address bar
 * via `history.replaceState`, before anything is played. Same discipline the
 * router reserved for `#/connect`: a URL describing what someone is
 * watching should not survive in history, in a screenshot, or in whatever
 * the next person to pick up the device sees.
 */

function report(state: HandoffUiState, message: string, link = ''): void {
    set(HANDOFF_STATE, state);
    set(HANDOFF_MESSAGE, message);
    set(HANDOFF_LINK, link);
}

function activeSnapshot(): ActiveChannelSnapshot | null {
    return getPathObj<ActiveChannelSnapshot | null>(appState, PLAYER_ACTIVE) ?? null;
}

export function registerHandoffActions(): void {
    defineFn('handoff/offer', () => {
        void offerHandoff();
    });
    defineFn('handoff/dismiss', () => {
        report('idle', '');
    });
}

/**
 * Produces the link for whatever is playing. Copying to the clipboard is
 * best-effort and the link is shown either way — most TV webviews have no
 * clipboard at all, and a feature that silently does nothing there would be
 * worse than one that just shows you the address.
 */
export async function offerHandoff(): Promise<void> {
    const snapshot = activeSnapshot();
    if (!snapshot) {
        report('failed', strings.handoff.nothingPlaying);
        return;
    }

    const session = sessionFor(snapshot, currentPositionSec(), Date.now());
    if (!session) {
        report('failed', strings.handoff.cannotShare);
        return;
    }

    const link = handoffUrl(session, location.href);
    report('offered', strings.handoff.offered, link);
    try {
        await navigator.clipboard.writeText(link);
        report('offered', strings.handoff.copied, link);
    } catch {
        // Left as-is: the link is already on screen, which is the fallback.
    }
}

/**
 * Reads a handoff out of the current URL and plays it. Returns true when one
 * was present, so boot can skip the normal restore rather than starting the
 * previous channel and then yanking to this one.
 */
export async function consumeHandoff(): Promise<boolean> {
    const session = handoffFromHash(location.hash);
    if (!session) return false;

    // Scrub first, before any await: an early return below must not be able
    // to leave the payload sitting in the address bar.
    history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);

    if (get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID) !== session.sourceId) {
        // A handoff naming a source this device does not have at all would
        // otherwise switch to nothing and report "not found", which is the
        // wrong diagnosis for the commonest real failure.
        const sources = get<{ id: string }[]>(PLAYLIST_SOURCES) ?? [];
        if (!sources.some((source) => source.id === session.sourceId)) {
            report('failed', strings.handoff.wrongSource);
            return true;
        }
        setActiveSourceId(session.sourceId);
        // `setActiveSourceId` also triggers a load through the watch in
        // `list-bindings.ts`; awaiting our own call is one redundant read of
        // an already-warm source, and buys the handoff actually resolving
        // instead of racing the rows it needs.
        await loadActiveSource();
    }

    const resolved = resolveHandoff(session, getRows(), get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID) ?? null);
    if (!resolved.ok) {
        report('failed', resolved.failure === 'wrong-source' ? strings.handoff.wrongSource : strings.handoff.notFound);
        return true;
    }

    // The position goes into the same store a local resume reads, so the
    // engine needs no separate "this one came from elsewhere" path.
    const seconds = resumePositionFor(session, Date.now());
    if (seconds > 0) await rememberPosition(session.feedKey, seconds);

    setActiveChannel(resolved.snapshot);
    location.hash = `#/${viewForSnapshot(resolved.snapshot)}`;
    report('arrived', `${strings.handoff.arrived} ${resolved.snapshot.name}`);
    return true;
}
