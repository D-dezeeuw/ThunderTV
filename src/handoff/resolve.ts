import { streamKey } from '../health/stream-key';
import type { ChannelRow } from '../m3u/types';
import type { ActiveChannelSnapshot } from '../state/records';
import type { HandoffSession } from './session';

/**
 * Turning "that feed, wherever it lives on your device" back into something
 * playable — the receiving half of stone 9.
 *
 * The whole resolution is one comparison: does any row this device has
 * produce the same masked stream key? That works precisely because
 * `src/health/stream-key.ts` strips the credential segments, so two devices
 * signed in to the same provider with different passwords — or the same
 * account after a rotation — still agree on what a feed *is*.
 *
 * A failure here is a real answer, not an error. "You do not have that
 * source" is the honest thing to say, and it is the case the format
 * guarantees will happen (a handoff deliberately cannot carry an account).
 */

export type HandoffFailure = 'wrong-source' | 'not-found';

export type HandoffResolution =
    | { ok: true; snapshot: ActiveChannelSnapshot }
    | { ok: false; failure: HandoffFailure };

/** Matches by masked stream key first, then by name — a provider that reissues a path leaves the name as the only thread left. */
function findRow(rows: readonly ChannelRow[], session: HandoffSession): ChannelRow | null {
    for (const row of rows) {
        if (streamKey(row.url) === session.feedKey) return row;
    }
    // Name matching is last because it is genuinely weaker: two feeds of the
    // same channel differ only by URL. It is still better than refusing a
    // handoff outright when a provider has re-pathed its catalog.
    return rows.find((row) => row.name === session.name) ?? null;
}

export function resolveHandoff(
    session: HandoffSession,
    rows: readonly ChannelRow[],
    activeSourceId: string | null,
): HandoffResolution {
    if (activeSourceId !== session.sourceId) return { ok: false, failure: 'wrong-source' };

    const row = findRow(rows, session);
    if (!row) return { ok: false, failure: 'not-found' };

    return {
        ok: true,
        snapshot: {
            id: row.id,
            sourceId: session.sourceId,
            name: row.name,
            streamUrl: row.url,
            logo: row.logo,
            group: row.group,
            ...(row.radio ? { radio: true } : {}),
            ...(session.kind === 'live' ? {} : { kind: session.kind }),
        },
    };
}

/**
 * Builds the session to hand over from what is playing right now, or `null`
 * when the feed cannot be named without its URL — a stream address the
 * masker does not recognise is one whose credentials it cannot promise to
 * have removed, and the only safe handoff for that is no handoff.
 */
export function sessionFor(
    snapshot: ActiveChannelSnapshot,
    positionSec: number,
    nowMs: number,
): HandoffSession | null {
    const feedKey = streamKey(snapshot.streamUrl);
    if (!feedKey) return null;

    const kind = snapshot.kind ?? 'live';
    return {
        v: 1,
        sourceId: snapshot.sourceId,
        feedKey,
        name: snapshot.name,
        kind,
        positionSec: kind === 'live' ? 0 : Math.max(0, Math.round(positionSec)),
        at: nowMs,
    };
}
