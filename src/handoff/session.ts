/**
 * What "carry on where I left off, over there" is actually made of —
 * Vision 3.0's stone 9.
 *
 * ## The one rule this format exists to keep
 *
 * **A handoff never carries a stream URL.** Every provider URL in this app
 * has the account's username and password in its path, and a handoff is
 * something a user will inevitably send through a chat app, paste into a
 * note, or leave in a browser history. So a session names *which feed* by
 * `src/health/stream-key.ts`'s masked fingerprint — the same credential-free
 * identifier the Codex uses — and the receiving device resolves that against
 * its own copy of the source.
 *
 * The consequence is deliberate and worth stating plainly: **a handoff only
 * works on a device that already has that source configured.** It cannot
 * hand someone an account they do not have, and it is not a sharing
 * mechanism. That is precisely the vision's framing — "devices you own,
 * talking on a network you control" — expressed as a property of the format
 * rather than a promise in the docs.
 *
 * ## Why not the channel id
 *
 * `makeChannelRowId()` is `playlistId:index` — a *position* in a parse. Two
 * devices that imported the same playlist a week apart can disagree about it
 * the moment the provider reorders a row, and the handoff would then resume
 * the wrong programme with no way to tell. The masked stream key survives
 * reordering and password rotation both, which is the whole reason Phase 33
 * derived it that way.
 */

export const HANDOFF_FORMAT_VERSION = 1;

export interface HandoffSession {
    v: typeof HANDOFF_FORMAT_VERSION;
    /** Which source it belongs to, so the receiver can say *which* one it is missing. */
    sourceId: string;
    /** `src/health/stream-key.ts`'s masked fingerprint — the feed's identity, with no credential in it. */
    feedKey: string;
    /** Human-readable, so the receiving device can name what it is about to play (or admit it cannot find). */
    name: string;
    kind: 'live' | 'vod' | 'series';
    /** Seconds into the programme. Always 0 for live, which has no meaningful position. */
    positionSec: number;
    /** When the handoff was made — a stale one must not silently seek into a programme that has since ended. */
    at: number;
}

/**
 * How long a handoff stays useful. A link found in a chat thread a week
 * later should not yank the receiving device into the middle of something:
 * past this, the position is dropped and playback starts from the top.
 */
export const HANDOFF_POSITION_TTL_MS = 12 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Structural validation of something that arrived in a URL. Strict about
 * types and about the version — a handoff from a future format is refused
 * rather than half-understood, because half-understanding it means seeking
 * to a position that might mean something else.
 */
export function isHandoffSession(value: unknown): value is HandoffSession {
    if (!isRecord(value)) return false;
    if (value['v'] !== HANDOFF_FORMAT_VERSION) return false;
    const kind = value['kind'];
    return (
        typeof value['sourceId'] === 'string' &&
        typeof value['feedKey'] === 'string' &&
        value['feedKey'] !== '' &&
        typeof value['name'] === 'string' &&
        (kind === 'live' || kind === 'vod' || kind === 'series') &&
        typeof value['positionSec'] === 'number' &&
        Number.isFinite(value['positionSec']) &&
        value['positionSec'] >= 0 &&
        typeof value['at'] === 'number' &&
        Number.isFinite(value['at'])
    );
}

/**
 * The position to actually resume at. Live is always 0 — seeking a live
 * feed to a wall-clock offset means nothing — and an expired handoff falls
 * back to the start rather than to a guess.
 */
export function resumePositionFor(session: HandoffSession, nowMs: number): number {
    if (session.kind === 'live') return 0;
    if (nowMs - session.at > HANDOFF_POSITION_TTL_MS) return 0;
    // A handoff dated in the future is a clock disagreement, not a reason to
    // discard a position the sending device meant honestly.
    return session.positionSec;
}
