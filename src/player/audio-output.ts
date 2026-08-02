import { strings } from '../app/strings';
import { getPlatform } from '../core/platform';
import { PLAYER_ACTIVE } from '../state/player';
import { reportPlaybackNotice } from '../state/player.actions';
import { get } from '../state/typed';
import { clearNoAudioMark, markedContentId, markNoAudio } from './no-audio-marks';

/**
 * "The picture is fine and there is no sound" — the one playback failure no
 * error event ever reports.
 *
 * A browser that meets an audio codec it has no decoder for does not fail
 * the load: it plays the video track and drops the audio one on the floor,
 * silently and with `video.error` left null. On IPTV that is routine, since
 * a large share of movie files (and a fair few `.ts` channels) carry AC-3,
 * E-AC-3 or DTS, none of which Chromium's ffmpeg build decodes — and
 * mpegts.js only ever demuxes AAC/MP3 regardless of what the browser can do.
 * The viewer's first guess is always the volume, then the app.
 *
 * The elementised decoder counters answer it for every engine at once:
 * mpegts.js, hls.js and native all feed the same `<video>`, so
 * `webkitAudioDecodedByteCount` staying at zero while
 * `webkitVideoDecodedByteCount` climbs means the pipeline is decoding
 * pictures and nothing else. Firefox exposes no counters but does expose
 * `mozHasAudio`, which answers the same question directly. A browser with
 * neither reports `'unknown'` and says nothing — a wrong "no audio" notice
 * over a stream that is merely quiet would be worse than none.
 *
 * What is *done* about a positive verdict is `transcode-fallback.ts`'s
 * decision, not this module's: on the desktop a film restarts through the
 * bundled ffmpeg with its audio re-encoded, and only where that is
 * impossible (the web, a live channel, a failed transcode) does the verdict
 * still surface as the message this file used to publish outright.
 */

/** The subset of the (non-standard, vendor-prefixed) decoder statistics this reads — declared structurally so the judge can be tested with plain objects. */
export interface AudioOutputSample {
    audioBytes?: number | undefined;
    videoBytes?: number | undefined;
    /** Firefox's `mozHasAudio`: whether the resource has an audio track at all. */
    hasAudio?: boolean | undefined;
}

interface DecoderStatsVideo extends HTMLVideoElement {
    webkitAudioDecodedByteCount?: number;
    webkitVideoDecodedByteCount?: number;
    mozHasAudio?: boolean;
}

export function readAudioOutput(video: HTMLVideoElement): AudioOutputSample {
    const el = video as DecoderStatsVideo;
    return {
        audioBytes: el.webkitAudioDecodedByteCount,
        videoBytes: el.webkitVideoDecodedByteCount,
        hasAudio: el.mozHasAudio,
    };
}

/**
 * `'silent'` only where the evidence is positive: the element has decoded
 * video and not one byte of audio, or Firefox says outright there is no
 * audio track. Everything else — no counters, no video decoded yet (nothing
 * is playing, which is the error path's business, not this one) — is
 * `'unknown'`, which reports nothing.
 */
export function judgeAudioOutput(sample: AudioOutputSample): 'ok' | 'silent' | 'unknown' {
    if (sample.hasAudio === false) return 'silent';
    if ((sample.audioBytes ?? 0) > 0 || sample.hasAudio === true) return 'ok';
    if (sample.audioBytes === undefined) return 'unknown';
    return (sample.videoBytes ?? 0) > 0 ? 'silent' : 'unknown';
}

/**
 * Sampled rather than watched, and late rather than early: a stream that
 * starts with a few seconds of black leader has decoded video and no audio
 * for entirely innocent reasons, and MSE appends audio in bursts. Three
 * probes spread over half a minute are enough to tell "this file has no
 * playable audio" from "the first append hasn't landed yet", and the first
 * `'ok'` ends the watch.
 */
const PROBE_DELAYS_MS = [6_000, 15_000, 30_000];

let timers: ReturnType<typeof setTimeout>[] = [];
let watched: { video: HTMLVideoElement; onPlaying: () => void } | null = null;

function clearTimers(): void {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
}

function probe(video: HTMLVideoElement): void {
    const verdict = judgeAudioOutput(readAudioOutput(video));
    if (verdict === 'unknown') return;
    clearTimers();
    if (verdict !== 'silent') {
        // Audible: drop anything this device learned about the title on a
        // previous attempt (`no-audio-marks.ts`). A file can be replaced with
        // a different encode, and a stale warning is the one failure mode a
        // badge nobody can clear would have.
        clearNoAudioMark(markedContentId(get(PLAYER_ACTIVE)));
        reportPlaybackNotice(null);
        return;
    }
    // Not a message on every host any more: where the app owns a main
    // process with ffmpeg in it, the film restarts with its audio
    // re-encoded instead (`transcode-fallback.ts`), and the message is what
    // is left when that is impossible or fails.
    //
    // The capability is checked *here*, before the import, and again inside
    // `handleSilentAudio()` (which also has to answer for a stream that is
    // not transcodable). One duplicated `if` buys a plain statement about the
    // TV build: on a host with no transcoder — every browser, every webOS TV
    // — nothing under `transcode-*` is ever fetched, not even to print this.
    if (!getPlatform().audioTranscode) {
        markNoAudio(markedContentId(get(PLAYER_ACTIVE)), 'no-transcode', 'silent');
        reportPlaybackNotice(strings.list.playerNoAudioDecoded);
        return;
    }
    void import('./transcode-fallback').then((module) => module.handleSilentAudio(video));
}

/**
 * Starts watching `video` for the current stream; replaces any previous
 * watch, so it is safe to call on every attach. The probes are armed from
 * the element's first `playing` — before that there is nothing to measure,
 * and a stream that never starts is the engine chain's failure to report.
 */
export function watchAudioOutput(video: HTMLVideoElement): void {
    stopAudioOutputWatch();
    reportPlaybackNotice(null);

    const onPlaying = (): void => {
        if (timers.length > 0) return;
        timers = PROBE_DELAYS_MS.map((delay) => setTimeout(() => probe(video), delay));
    };
    video.addEventListener('playing', onPlaying);
    watched = { video, onPlaying };
}

export function stopAudioOutputWatch(): void {
    clearTimers();
    if (watched) {
        watched.video.removeEventListener('playing', watched.onPlaying);
        watched = null;
    }
    reportPlaybackNotice(null);
}

/** Test-only reset, same convention as `stream-health.ts`'s. @internal */
export function resetAudioOutputForTests(): void {
    clearTimers();
    watched = null;
}
