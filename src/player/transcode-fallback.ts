import { strings } from '../app/strings';
import { applyProxy } from '../core/http/proxy';
import { getPlatform } from '../core/platform';
import { effectiveProxyTemplate } from '../core/platform/electron-platform';
import { streamKey } from '../health/stream-key';
import { PLAYER_ACTIVE } from '../state/player';
import { reportPlaybackNotice } from '../state/player.actions';
import { get } from '../state/typed';
import { attachAndPlay, detach } from './engine';
import { monitorPlaybackPosition } from './position';
import { attachTranscode } from './transcode-engine';

/**
 * What happens when a film turns out to have audio this device cannot
 * decode — the one decision `audio-output.ts` hands off rather than
 * answering itself.
 *
 * On the web the answer is still a sentence: no browser ships an AC-3,
 * E-AC-3 or DTS decoder and the page cannot install one. On the desktop the
 * app owns a main process with ffmpeg in it, so the answer is to play the
 * film again with its audio re-encoded and say almost nothing
 * (`transcode-engine.ts`, `desktop/transcode.mjs`). The viewer sees a
 * restart of a few seconds where they used to see a paragraph explaining
 * why there is no sound.
 *
 * VOD only, and that is not a shortcut being taken. A live channel has no
 * duration to seek in, is routinely MPEG-2 video that `-c:v copy` cannot put
 * in an MP4 anything will play, and reaches the element through mpegts.js
 * rather than the media pipeline this route replaces. Live keeps the
 * message.
 */

/** One attempt per film. A second one cannot succeed where the first failed, and a loop of restarts is a worse failure than silence. */
let attemptedFor: string | null = null;

interface ActiveSnapshot {
    streamUrl?: string;
    kind?: string;
}

/**
 * The provider URL to transcode, or `null` when this stream is not a
 * candidate. Unproxied on purpose: ffmpeg runs in the main process, where
 * the loopback proxy solves a problem (CORS, and requests leaving from this
 * machine's IP) that does not exist.
 */
export function transcodableSource(active: unknown): string | null {
    const snapshot = active as ActiveSnapshot | null;
    const url = snapshot?.streamUrl;
    if (!url || (snapshot?.kind !== 'vod' && snapshot?.kind !== 'series')) return null;
    return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Called once a stream has proven it decodes pictures and no audio at all.
 * Publishes the message where nothing better is available, and otherwise
 * restarts the film through the transcoder at the second it had reached.
 */
export async function handleSilentAudio(video: HTMLVideoElement): Promise<void> {
    const source = transcodableSource(get(PLAYER_ACTIVE));
    if (!getPlatform().audioTranscode || !source) {
        reportPlaybackNotice(strings.list.playerNoAudioDecoded);
        return;
    }
    // Asked twice for the same film: the transcode either failed or is
    // itself silent, and either way the second answer is the message —
    // the one that admits both halves of what was tried.
    if (attemptedFor === source) {
        reportPlaybackNotice(strings.list.playerNoAudioDecodedTranscodeFailed);
        return;
    }
    attemptedFor = source;

    const at = Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;
    const proxied = applyProxy(effectiveProxyTemplate(), source);
    reportPlaybackNotice(strings.list.playerTranscodingAudio);

    // A full stop first: the direct attempt owns the element, an engine, a
    // health monitor and a position monitor, and the transcode route brings
    // its own of each.
    detach(video);
    const started = await attachTranscode(video, source, at, {
        onFailure: (detail) => {
            fallBackToDirect(video, proxied, detail);
        },
        // The notice is meant to cover the restart, not to sit there for the
        // rest of the film.
        onPlaying: () => {
            reportPlaybackNotice(null);
        },
    });

    if (!started) {
        fallBackToDirect(video, proxied, 'the transcoder did not start');
        return;
    }
    // The same position store, under the same key the direct attempt used,
    // so leaving mid-film resumes in the right place whichever route played
    // it (`position.ts`). Not `trackPlaybackPosition()`: its resume half
    // would seek the moment metadata lands, and a seek here is a restart of
    // the transcode we have only just started.
    monitorPlaybackPosition(video, streamKey(proxied));
}

/**
 * Transcoding failed: put the film back the way it was — picture, no sound
 * — and say both halves of what happened. Silently leaving a black screen
 * because a *fix* failed would be strictly worse than the bug.
 */
function fallBackToDirect(video: HTMLVideoElement, proxiedUrl: string, detail: string): void {
    console.warn('[ThunderTV] audio transcode unavailable:', detail);
    reportPlaybackNotice(strings.list.playerNoAudioDecodedTranscodeFailed);
    void attachAndPlay(video, proxiedUrl, { live: false });
}

/** Test-only reset — the one-attempt guard is process-lifetime module state. @internal */
export function resetTranscodeFallbackForTests(): void {
    attemptedFor = null;
}
