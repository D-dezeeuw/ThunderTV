import { getPlatform } from '../core/platform';

/**
 * Which titles came out silent on *this* kind of device, learned by playing
 * them.
 *
 * The layer above this one (`state/catalog-audio-warning.ts`) warns from
 * what the panel claims a file contains, which is absent as often as it is
 * present and wrong often enough that it may never gate anything. This layer
 * is the opposite: nothing is recorded until the app has watched a title
 * decode pictures and no audio for half a minute (`audio-output.ts`), and on
 * the desktop, not until the transcode that exists to fix exactly that has
 * also failed. There is no guessing left in it.
 *
 * **The class matters more than the mark.** "Silent in a browser" and
 * "silent even with ffmpeg behind it" are different findings, and only the
 * second one is true everywhere:
 *
 *  - `'no-transcode'` — observed on a host with no transcoder. Says nothing
 *    about the desktop, which re-encodes precisely this case, so it only
 *    warns on hosts that likewise cannot transcode.
 *  - `'transcode'` — observed on a host that tried ffmpeg *and still* got
 *    nothing. If that device could not produce sound, no browser will, so
 *    this warns everywhere.
 *
 * A mark is dropped the moment the same title plays with sound: the file may
 * have been replaced with a different encode, the panel may have been
 * reconfigured, or the evidence may simply have been wrong. Being wrong
 * toward "we know nothing about this title" is always recoverable.
 *
 * Stored as one small keyed blob rather than a bulk table (the same
 * `get`/`set` surface `state/catalog-storage.ts` uses, and for the same
 * reason: no table is shaped for it and this is a few kilobytes at its cap).
 * Unlike the catalog cache it is written on every tier — the device that
 * most needs this is a browser, which is exactly the device most likely to
 * be on `localStorage`.
 */

export type NoAudioClass = 'no-transcode' | 'transcode';

export interface NoAudioMark {
    /** The catalog row id — `vod:<streamId>` or `series:<seriesId>` — so a list can match one without a lookup. */
    id: string;
    platformClass: NoAudioClass;
    /** Technical, never shown: the transcode's failure detail, or `'silent'`. */
    reason: string;
    at: number;
}

const STORAGE_KEY = 'player.noAudioMarks';
/** Generous — one entry is ~100 bytes — but bounded, since nothing here is ever pruned by a TTL. */
const MARK_CAP = 300;

let marks = new Map<string, NoAudioMark>();

/** Called once at boot (`app/bootstrap.ts`), alongside the other synchronous-mirror primers. */
export async function primeNoAudioMarks(): Promise<void> {
    try {
        const stored = await getPlatform().storage.get<NoAudioMark[]>(STORAGE_KEY);
        marks = new Map((stored ?? []).filter(isMark).map((mark) => [mark.id, mark]));
    } catch {
        // A device with no usable storage still learns within the session.
    }
}

function isMark(value: unknown): value is NoAudioMark {
    const mark = value as NoAudioMark | null;
    return Boolean(mark && typeof mark.id === 'string' && (mark.platformClass === 'transcode' || mark.platformClass === 'no-transcode'));
}

/**
 * Does what this device knows about `id` apply to what this device can do?
 * Pure, because it is the whole rule (see the header) and the thing most
 * worth pinning in a test.
 */
export function markApplies(mark: NoAudioMark | null | undefined, canTranscode: boolean): boolean {
    if (!mark) return false;
    return mark.platformClass === 'transcode' || !canTranscode;
}

export function noAudioMark(id: string | null | undefined): NoAudioMark | null {
    return id ? (marks.get(id) ?? null) : null;
}

/** Re-marking an already-marked title refreshes it rather than duplicating — and a `'transcode'` finding is never downgraded by a later `'no-transcode'` one. */
export function markNoAudio(id: string | null, platformClass: NoAudioClass, reason: string): void {
    if (!id) return;
    const existing = marks.get(id);
    if (existing?.platformClass === 'transcode' && platformClass === 'no-transcode') return;
    marks.delete(id);
    marks.set(id, { id, platformClass, reason: reason.slice(0, 200), at: Date.now() });
    while (marks.size > MARK_CAP) {
        // Insertion order is recency order, so the oldest is simply first.
        const oldest = marks.keys().next().value;
        if (oldest === undefined) break;
        marks.delete(oldest);
    }
    void persist();
}

/** The title played with sound: whatever was recorded about it is no longer true. */
export function clearNoAudioMark(id: string | null | undefined): void {
    if (!id || !marks.delete(id)) return;
    void persist();
}

export function allNoAudioMarks(): readonly NoAudioMark[] {
    return [...marks.values()];
}

async function persist(): Promise<void> {
    try {
        await getPlatform().storage.set(STORAGE_KEY, [...marks.values()]);
    } catch {
        // Same reasoning as `src/health/store.ts`'s silent write: this is an
        // annotation, and losing it costs one more silent film, not a bug.
    }
}

/**
 * The id a mark is filed under, from `player.active`. A series is marked as
 * a *show*, not as an episode: a season is encoded as one batch, the list
 * row a viewer sees is the show, and marking episode 3 of 24 would warn
 * nobody about the other 23.
 */
export function markedContentId(active: unknown): string | null {
    const snapshot = active as { id?: string; kind?: string; series?: { seriesId?: number } } | null;
    if (!snapshot?.id) return null;
    if (snapshot.kind === 'series') {
        const seriesId = snapshot.series?.seriesId;
        return seriesId === undefined ? null : `series:${String(seriesId)}`;
    }
    // Live is deliberately absent: it never reaches the transcode route, and
    // a channel that is silent tonight is routinely fine tomorrow.
    return snapshot.kind === 'vod' ? snapshot.id : null;
}

/** Test-only reset, same convention as `resetHealthCacheForTests()`. @internal */
export function resetNoAudioMarksForTests(): void {
    marks = new Map();
}
