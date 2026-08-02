import { getPlatform } from '../core/platform';
import type { AudioTranscodeControl } from '../core/platform/transcode-adapter';
import { openTranscodeStream, type Chunk, type OpenStream } from './transcode-stream';

/**
 * Playing the desktop shell's transcoded stream — the renderer half of
 * `desktop/transcode.mjs`.
 *
 * Why MediaSource and not `video.src`. The transcode arrives as a
 * fragmented MP4 on a pipe: no `Content-Length`, no byte ranges, and an
 * `mvhd` duration of zero, because ffmpeg cannot know at the moment it
 * writes the header how long a stream it is about to produce. Handed
 * straight to a `<video>`, that plays with sound and is otherwise a live
 * feed: unknown duration, a scrub bar that means nothing, and no way to
 * jump anywhere. For a *film* that is not a fix, it is a different bug.
 *
 * MediaSource is what buys the timeline back. `duration` is set from what
 * ffmpeg probed off the real file, so the bar shows the film's real length
 * from the first frame; `timestampOffset` places each restart at its true
 * position, so `currentTime` is a position in the film rather than in this
 * particular ffmpeg run; and a seek outside what is buffered restarts the
 * transcode at that second (`-ss`, one keyframe scan) instead of streaming
 * everything in between. Inside the buffer, seeking is the browser's own
 * and costs nothing at all.
 *
 * The buffer is deliberately kept small in both directions — a couple of
 * minutes of a copied 4K video stream is hundreds of megabytes, and MSE's
 * quota is not. Not reading is the whole flow-control mechanism: the socket
 * stalls, ffmpeg's write blocks, and the provider stops being read from,
 * which is what keeps "watching a film" from meaning "download a film as
 * fast as the link allows".
 */

/** Stop pulling once this much play-ahead is buffered; resume when it drains. */
const MAX_BUFFER_AHEAD_SEC = 60;
/** Keep this much behind the playhead for a short seek back; drop the rest. */
const MAX_BUFFER_BEHIND_SEC = 30;
const CAPACITY_POLL_MS = 250;
/** A seek this close to buffered data is served by the buffer, not by a restart. */
const SEEK_TOLERANCE_SEC = 0.5;
/** `sourceopen` is the browser attaching the element to the MediaSource — it is immediate or it is broken. */
const SOURCE_OPEN_TIMEOUT_MS = 10_000;

export interface TranscodeAttachOptions {
    /** The route died in a way the viewer has to be told about — the caller decides what to say and what to fall back to. */
    onFailure(detail: string): void;
    /** The transcoded stream is actually playing, i.e. the notice about it can go. */
    onPlaying?: () => void;
}

interface Session {
    video: HTMLVideoElement;
    sourceUrl: string;
    control: AudioTranscodeControl;
    mediaSource: MediaSource;
    objectUrl: string;
    buffer: SourceBuffer | null;
    controller: AbortController;
    /** Bumped by every restart; every async continuation carries the value it started with, exactly as `engine.ts`'s attach token does. */
    generation: number;
    /** The position the current generation is being fed from — the answer to "is this seek already being served?". */
    startedAt: number;
    stopped: boolean;
    options: TranscodeAttachOptions;
    listeners: (() => void)[];
}

let session: Session | null = null;

/**
 * Plays `sourceUrl` through the transcoder from `startAt` seconds.
 * Resolves `false` when this host has no transcoder, the browser has no
 * MediaSource, or the stream cannot be opened — in every one of those the
 * caller still owns the failure, and nothing has been left half-attached.
 */
export async function attachTranscode(
    video: HTMLVideoElement,
    sourceUrl: string,
    startAt: number,
    options: TranscodeAttachOptions,
): Promise<boolean> {
    detachTranscode();
    const control = getPlatform().audioTranscode;
    if (!control || typeof MediaSource === 'undefined') return false;

    // The session is registered before the first `await`, not after it:
    // opening the stream takes a second or two, and a viewer who presses
    // stop inside that window must be able to cancel it. `detachTranscode()`
    // then aborts this controller and the checks below see a stale session,
    // instead of a film that starts playing after it was stopped.
    const mediaSource = new MediaSource();
    const active: Session = {
        video,
        sourceUrl,
        control,
        mediaSource,
        objectUrl: URL.createObjectURL(mediaSource),
        buffer: null,
        controller: new AbortController(),
        generation: 0,
        startedAt: startAt,
        stopped: false,
        options,
        listeners: [],
    };
    session = active;

    const opened = await openTranscodeStream(control, sourceUrl, startAt, active.controller.signal);
    if (session !== active || active.stopped) return false;
    if (!opened) {
        detachTranscode();
        return false;
    }
    video.src = active.objectUrl;

    const open = await onceEvent(mediaSource, 'sourceopen', SOURCE_OPEN_TIMEOUT_MS);
    if (session !== active || active.stopped) return false;
    if (!open) {
        detachTranscode();
        return false;
    }

    // Asked before `addSourceBuffer()` rather than instead of it: the throw
    // below is a `NotSupportedError` whose message names nothing, and "this
    // build has no HEVC decoder" is the one answer a viewer whose film has a
    // picture but no sound can act on (`mp4-init.ts` now names HEVC, which
    // macOS/Windows Electron decode and the web build does not).
    if (!MediaSource.isTypeSupported(opened.mime)) {
        detachTranscode();
        options.onFailure(`this device cannot decode the transcoded stream (${opened.mime})`);
        return false;
    }

    try {
        if (opened.durationSec && Number.isFinite(opened.durationSec)) mediaSource.duration = opened.durationSec;
        active.buffer = mediaSource.addSourceBuffer(opened.mime);
        active.buffer.timestampOffset = startAt;
        // The film restarts where it left off, and the appended frames carry
        // that timestamp — so the element has to be told to start there too,
        // or it waits forever for data at zero that is never coming. Set
        // before any of it is appended, while `readyState` is still
        // HAVE_NOTHING: that makes it the *default playback start position*
        // rather than a seek, so nothing has to be un-done.
        if (startAt > 0) video.currentTime = startAt;
    } catch (err) {
        detachTranscode();
        options.onFailure(`transcoded stream is not playable here (${opened.mime}): ${String(err)}`);
        return false;
    }

    listen(active, 'seeking', () => {
        onSeeking(active);
    });
    listen(active, 'error', () => {
        fail(active, active.generation, `transcoded playback failed: ${String(video.error?.message ?? 'media error')}`);
    });
    listen(active, 'playing', () => {
        options.onPlaying?.();
    });

    void pump(active, active.generation, opened);
    await video.play().catch(() => undefined);
    return true;
}

/** Idempotent full stop. `engine.ts`'s `detachEngines()` calls this on every attach and every teardown, so it must survive being called when nothing is running. */
export function detachTranscode(): void {
    const active = session;
    session = null;
    if (!active) return;
    active.stopped = true;
    active.controller.abort();
    for (const off of active.listeners) off();
    try {
        if (active.mediaSource.readyState === 'open') active.mediaSource.endOfStream();
    } catch {
        // A MediaSource the element already let go of; nothing to end.
    }
    URL.revokeObjectURL(active.objectUrl);
}

/** Test-only reset, same convention as `resetPlayerEngineForTests()`. @internal */
export function resetTranscodeForTests(): void {
    session = null;
}

function listen(active: Session, event: string, handler: () => void): void {
    active.video.addEventListener(event, handler);
    active.listeners.push(() => {
        active.video.removeEventListener(event, handler);
    });
}

/** Feeds one opened stream into the SourceBuffer until it ends, is superseded, or breaks. */
async function pump(active: Session, generation: number, opened: OpenStream): Promise<void> {
    try {
        for (const chunk of opened.head) {
            if (!current(active, generation)) return;
            await append(active, generation, chunk);
        }
        for (;;) {
            if (!current(active, generation)) return;
            await waitForCapacity(active, generation);
            if (!current(active, generation)) return;
            const { done, value } = await opened.reader.read();
            if (done) break;
            if (value) await append(active, generation, value);
        }
        if (!current(active, generation)) return;
        if (active.mediaSource.readyState === 'open') active.mediaSource.endOfStream();
    } catch (err) {
        // An abort is how a seek and a teardown both look from in here.
        if (!current(active, generation)) return;
        fail(active, generation, `transcoded stream stopped: ${String(err)}`);
    }
}

function current(active: Session, generation: number): boolean {
    return session === active && !active.stopped && active.generation === generation;
}

async function append(active: Session, generation: number, chunk: Chunk): Promise<void> {
    const buffer = active.buffer;
    if (!buffer) return;
    await evict(active);
    if (!current(active, generation)) return;
    try {
        buffer.appendBuffer(chunk);
    } catch (err) {
        if (!(err instanceof DOMException) || err.name !== 'QuotaExceededError') throw err;
        // The one recoverable append failure: drop everything behind the
        // playhead and try the same bytes once more.
        await evict(active, 0);
        if (!current(active, generation)) return;
        buffer.appendBuffer(chunk);
    }
    await onceUpdateEnd(buffer);
}

async function evict(active: Session, behindSec = MAX_BUFFER_BEHIND_SEC): Promise<void> {
    const buffer = active.buffer;
    if (!buffer || buffer.buffered.length === 0) return;
    const start = buffer.buffered.start(0);
    const cutoff = active.video.currentTime - behindSec;
    if (cutoff <= start) return;
    if (buffer.updating) await onceUpdateEnd(buffer);
    buffer.remove(start, cutoff);
    await onceUpdateEnd(buffer);
}

async function waitForCapacity(active: Session, generation: number): Promise<void> {
    while (current(active, generation) && bufferedAhead(active) >= MAX_BUFFER_AHEAD_SEC) {
        await new Promise((resolve) => setTimeout(resolve, CAPACITY_POLL_MS));
    }
}

/** Seconds of continuous buffer in front of the playhead — 0 when the playhead is in a gap, which is exactly when to keep pulling. */
function bufferedAhead(active: Session): number {
    const buffer = active.buffer;
    if (!buffer) return 0;
    const now = active.video.currentTime;
    for (let i = 0; i < buffer.buffered.length; i += 1) {
        if (buffer.buffered.start(i) <= now + SEEK_TOLERANCE_SEC && buffer.buffered.end(i) > now) {
            return buffer.buffered.end(i) - now;
        }
    }
    return 0;
}

function onSeeking(active: Session): void {
    if (session !== active || active.stopped) return;
    const target = active.video.currentTime;
    // Nothing appended yet and the seek lands where this generation already
    // starts: that is the browser echoing our own start position back, not a
    // viewer asking for somewhere else.
    if (active.buffer?.buffered.length === 0 && Math.abs(target - active.startedAt) < SEEK_TOLERANCE_SEC) return;
    if (bufferedAhead(active) > SEEK_TOLERANCE_SEC) return;
    void restart(active, target);
}

/**
 * A seek the buffer cannot answer: kill this transcode and start another at
 * the requested second. The old `pump()` is orphaned by the generation bump
 * and unwinds on its own once its aborted read rejects.
 */
async function restart(active: Session, atSeconds: number): Promise<void> {
    active.generation += 1;
    active.startedAt = atSeconds;
    const generation = active.generation;
    active.controller.abort();
    const controller = new AbortController();
    active.controller = controller;
    resetAppendState(active);

    const opened = await openTranscodeStream(active.control, active.sourceUrl, atSeconds, controller.signal);
    if (!current(active, generation)) return;
    if (!opened) {
        fail(active, generation, 'the transcoder could not seek this file');
        return;
    }
    try {
        // Again after the await: the abort above cancelled whatever was in
        // flight *then*, and this is the state the assignment below actually
        // requires. Wrapped because a SourceBuffer the element has let go of
        // throws here, and that is a failure to report rather than an
        // unhandled rejection out of a fire-and-forget seek.
        resetAppendState(active);
        if (active.buffer) active.buffer.timestampOffset = atSeconds;
    } catch (err) {
        fail(active, generation, `could not seek the transcoded stream: ${String(err)}`);
        return;
    }
    void pump(active, generation, opened);
}

/**
 * `abort()` is not really about aborting here — it is the only call that
 * puts the SourceBuffer's *append state* back to `WAITING_FOR_SEGMENT`, and
 * `timestampOffset` may not be assigned while a media segment is half
 * parsed. Cutting a transcode off mid-fragment leaves it exactly that way,
 * every time, so a seek without this fails with "The timestamp offset may
 * not be set while the SourceBuffer's append state is
 * 'PARSING_MEDIA_SEGMENT'" — which is what the first live run of this
 * module did, on the first seek, having played perfectly until then.
 * Checking `updating` instead is not enough: the last append can be long
 * finished and the parse still be mid-segment.
 */
function resetAppendState(active: Session): void {
    if (!active.buffer || active.mediaSource.readyState !== 'open') return;
    active.buffer.abort();
}

function fail(active: Session, generation: number, detail: string): void {
    if (!current(active, generation)) return;
    const { options } = active;
    detachTranscode();
    options.onFailure(detail);
}

function onceUpdateEnd(buffer: SourceBuffer): Promise<void> {
    if (!buffer.updating) return Promise.resolve();
    return new Promise((resolve) => {
        const done = (): void => {
            buffer.removeEventListener('updateend', done);
            buffer.removeEventListener('error', done);
            resolve();
        };
        buffer.addEventListener('updateend', done);
        buffer.addEventListener('error', done);
    });
}

function onceEvent(target: EventTarget, event: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            target.removeEventListener(event, done);
            resolve(false);
        }, timeoutMs);
        const done = (): void => {
            clearTimeout(timer);
            target.removeEventListener(event, done);
            resolve(true);
        };
        target.addEventListener(event, done);
    });
}
