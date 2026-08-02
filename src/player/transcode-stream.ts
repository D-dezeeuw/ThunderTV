import type { AudioTranscodeControl } from '../core/platform/transcode-adapter';
import { reportTranscodeDiagnostic } from '../state/player.actions';
import { readInitSegmentCodecs } from './mp4-init';

/**
 * Opening one transcoded stream and reading far enough into it to know what
 * it is — the front half of `transcode-engine.ts`, in its own file because
 * that one sits on ESLint's 400-line ceiling (the same "own file, one import
 * back" split `engine.ts`/`engine-select.ts` already uses next door).
 *
 * Reading the head *before* the element sees any of it is what makes a
 * failure survivable: ffmpeg's own errors — an unreachable file, a codec it
 * will not copy — come back as an HTTP status, and a status can be turned
 * into a sentence. Once a media element is consuming a body there is
 * nothing left to say to anyone.
 */

/** A `fetch` body chunk. Spelled with its buffer type because `SourceBuffer.appendBuffer()` will not take one that might be shared. */
export type Chunk = Uint8Array<ArrayBuffer>;

export interface OpenStream {
    reader: ReadableStreamDefaultReader<Chunk>;
    /** Everything read while looking for the `moov`, to be appended before anything else. */
    head: Chunk[];
    /** For `addSourceBuffer()`, read out of the init segment itself (`mp4-init.ts`). */
    mime: string;
    /** What ffmpeg probed off the real file — the film's length, which the fragmented MP4 cannot carry. */
    durationSec: number | null;
}

/** The `moov` sits at the very front; anything beyond this is not an init segment we can read. */
const INIT_SCAN_LIMIT_BYTES = 512 * 1024;

/** ffmpeg's stderr comes back in the 502 body; enough of it to name the cause, not so much that it fills a panel. */
const FAILURE_BODY_CHARS = 400;

/**
 * Everything the debug panel is entitled to know about one attempt, in one
 * line. The transcode server already produces all of it — a 502 whose body
 * is `ffmpeg exited (1)\n<stderr tail>`, and an
 * `x-thundertv-source-audio` header naming what the file actually carries —
 * and until now the renderer read the status, returned `null`, and threw the
 * rest away. That is why "the transcode failed" was the whole of every bug
 * report, this one included.
 */
function reportFailure(detail: string): void {
    reportTranscodeDiagnostic(`failed — ${detail}`);
}

/**
 * Resolves `null` for every kind of "no route": a refused request, a body
 * that never names its codecs, and an abort (routine — a second seek
 * cancels the first). Callers report that their own way; a rejection would
 * instead escape a fire-and-forget seek as an unhandled one.
 */
export async function openTranscodeStream(
    control: AudioTranscodeControl,
    sourceUrl: string,
    startAt: number,
    signal: AbortSignal,
): Promise<OpenStream | null> {
    let response: Response;
    try {
        response = await control.open(sourceUrl, startAt, signal);
    } catch (err) {
        // An abort is routine (a second seek cancels the first) and says
        // nothing worth keeping; anything else never reached the server.
        if (!signal.aborted) reportFailure(`the transcode server could not be reached (${String(err)})`);
        return null;
    }
    if (!response.ok || !response.body) {
        const body = await response.text().catch(() => '');
        reportFailure(`HTTP ${String(response.status)} — ${body.trim().slice(-FAILURE_BODY_CHARS) || 'no detail'}`);
        return null;
    }

    const sourceAudio = response.headers.get('x-thundertv-source-audio') ?? '';
    const durationHeader = Number(response.headers.get('x-thundertv-duration'));
    const reader = response.body.getReader();
    const head: Chunk[] = [];
    let scanned = 0;
    try {
        while (scanned < INIT_SCAN_LIMIT_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            head.push(value);
            scanned += value.byteLength;
            const codecs = readInitSegmentCodecs(concat(head, scanned));
            if (codecs) {
                reportTranscodeDiagnostic(
                    `opened — source audio ${sourceAudio || 'unknown'}, playing ${codecs.mime}`,
                );
                return {
                    reader,
                    head,
                    mime: codecs.mime,
                    durationSec: Number.isFinite(durationHeader) && durationHeader > 0 ? durationHeader : null,
                };
            }
        }
    } catch (err) {
        if (!signal.aborted) reportFailure(`the transcoded stream stopped while being read (${String(err)})`);
        return null;
    }
    await reader.cancel().catch(() => undefined);
    reportFailure(`no codec this build can name in the first ${String(scanned)} bytes (source audio ${sourceAudio || 'unknown'})`);
    return null;
}

function concat(chunks: Chunk[], total: number): Uint8Array {
    if (chunks.length === 1 && chunks[0]) return chunks[0];
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return merged;
}
