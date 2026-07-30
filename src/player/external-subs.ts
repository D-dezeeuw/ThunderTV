/**
 * Subtitles the viewer brings themselves — a `.srt`/`.vtt` from disk,
 * attached to the shared `<video>` as a real `<track>`.
 *
 * This exists because a movie's own subtitles are, in practice, unreachable.
 * Xtream VOD is a progressive file the browser plays natively
 * (`engine-select.ts`), its subtitle streams live inside the container
 * (MKV's SRT/PGS, an `.mp4`'s tx3g), and no browser exposes those to
 * `video.textTracks` — Chromium does not even demux them. hls.js can hand
 * over an HLS subtitle rendition and mpegts.js has no track API at all, so
 * for the entire Movies/TV Shows catalog the subtitle menu was correctly,
 * permanently empty. A file loaded here is the one route that always works.
 *
 * A `<track>` element is the whole mechanism: the browser renders it,
 * positions it, and lists it in `video.textTracks`, which means
 * `native-tracks.ts` picks it up as an ordinary track and the existing menu
 * (and the existing "Off" row) drives it with no special case anywhere.
 * The blob URL is this module's to revoke — hence the registry.
 */

import { toVtt } from './subtitle-text';

interface Attached {
    el: HTMLTrackElement;
    url: string;
}

let attached: Attached[] = [];

export interface ExternalSubtitle {
    label: string;
    /** BCP-47-ish tag, or `''` when the filename didn't carry one — never guessed. */
    lang: string;
    /** Raw file text; SubRip is converted here, WebVTT passes through. */
    text: string;
}

/**
 * Attaches `subtitle` and shows it immediately (loading a subtitle file is
 * an unambiguous request to see subtitles). Returns false when the text
 * carries no cues, which the caller surfaces — an empty track that silently
 * does nothing is the one outcome worth refusing.
 */
export function addExternalSubtitle(video: HTMLVideoElement, subtitle: ExternalSubtitle): boolean {
    const vtt = toVtt(subtitle.text);
    if (!vtt) return false;

    const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    const el = document.createElement('track');
    el.kind = 'subtitles';
    el.label = subtitle.label;
    if (subtitle.lang) el.srclang = subtitle.lang;
    el.src = url;
    video.appendChild(el);
    // Set after append: the element needs a parent before `track` is live,
    // and `mode` is what makes the browser fetch the src at all.
    el.track.mode = 'showing';
    attached.push({ el, url });
    return true;
}

/**
 * Drops every loaded track and revokes its blob. Called from the engine's
 * teardown, so a file loaded for one film never follows the viewer into the
 * next one — the timings would be silently wrong, which is worse than
 * absent.
 */
export function clearExternalSubtitles(): void {
    for (const { el, url } of attached) {
        el.remove();
        URL.revokeObjectURL(url);
    }
    attached = [];
}

/** How many loaded tracks are currently attached — for specs and for the menu's empty-state reasoning. @internal */
export function externalSubtitleCount(): number {
    return attached.length;
}
