/**
 * "Will this device play what the provider says this file contains?" —
 * asked *before* anything is played, from a panel's `get_vod_info` metadata
 * (`src/xtream/client.ts`).
 *
 * This is a warning mechanism, never a gate. Panel metadata is wrong often
 * enough that acting on it — refusing to play, hiding a title, pre-emptively
 * transcoding — would break films that work today; `transcode-fallback.ts`'s
 * header says the same thing from the other side, which is why the desktop
 * route is still triggered by measured silence rather than by this. What it
 * is good enough for is telling someone *before* they press play that the
 * title they are looking at is one of the ones that comes out silent, on
 * this device, with the reason named.
 *
 * Audio is judged from a list rather than from `canPlayType()`: Chromium
 * answers `''` for `ac-3` on the very desktop builds that do decode it, and
 * an empty string is indistinguishable from "no". The list is short because
 * the problem is: everything a browser cannot decode is either Dolby or DTS.
 *
 * Video is the opposite — the honest answer really is the platform's, and it
 * differs between the same app's two builds (HEVC hardware-decodes in
 * macOS/Windows Electron and not in a Chromium tab), so it is asked at
 * runtime through `MediaSource.isTypeSupported()` with a canonical codec
 * string per family.
 */

export type CodecVerdict = 'ok' | 'silent' | 'unplayable' | 'unknown';

/** No browser ships a decoder for these; the desktop's ffmpeg re-encodes them (`desktop/transcode.mjs`). Spelled in every form panels write them. */
const UNDECODABLE_AUDIO = new Set([
    'ac3',
    'ac-3',
    'eac3',
    'e-ac-3',
    'eac-3',
    'dts',
    'dca',
    'dtshd',
    'truehd',
    'mlp',
]);

/** What every browser does decode — listed so an unrecognized name stays `'unknown'` instead of being read as bad news. */
const DECODABLE_AUDIO = new Set(['aac', 'mp4a', 'mp3', 'mp2', 'opus', 'vorbis', 'flac', 'pcm', 'alac']);

/**
 * One canonical, real codec string per video family — the argument
 * `MediaSource.isTypeSupported()` actually wants. Levels are deliberately
 * middling (H.264 High 4.0, HEVC Main L93): a device that decodes the family
 * at all decodes these, and a level-specific "no" would be a wrong answer to
 * the question being asked.
 */
const VIDEO_PROBES: Record<string, string> = {
    h264: 'video/mp4; codecs="avc1.640028"',
    avc: 'video/mp4; codecs="avc1.640028"',
    avc1: 'video/mp4; codecs="avc1.640028"',
    hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
    h265: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
    hvc1: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
    vp9: 'video/mp4; codecs="vp09.00.10.08"',
    vp09: 'video/mp4; codecs="vp09.00.10.08"',
    av1: 'video/mp4; codecs="av01.0.05M.08"',
    av01: 'video/mp4; codecs="av01.0.05M.08"',
};

/** Panels write `AC-3`, `ac3`, `E-AC-3 (Dolby Digital+)` and worse; only the first token, lower-cased, is ever meaningful. */
export function normalizeCodecName(raw: string | null | undefined): string {
    return (raw ?? '').trim().toLowerCase().split(/[\s(,/]/)[0] ?? '';
}

/**
 * `'silent'` means "the picture will play and there will be no sound" — the
 * exact failure the viewer is being warned about, and the reason the desktop
 * (which can transcode) answers `'ok'` for the same codec.
 */
export function judgeAudioCodec(raw: string | null | undefined, canTranscode: boolean): CodecVerdict {
    const codec = normalizeCodecName(raw);
    if (!codec) return 'unknown';
    if (DECODABLE_AUDIO.has(codec)) return 'ok';
    if (UNDECODABLE_AUDIO.has(codec)) return canTranscode ? 'ok' : 'silent';
    return 'unknown';
}

/**
 * `'unplayable'` is the harder verdict: no picture at all, which no
 * transcode in this app fixes (`-c:v copy` is the whole point of it).
 * Anything this cannot probe stays `'unknown'` — on a host with no
 * MediaSource that is every codec, and a warning on every title would be
 * worse than none.
 */
export function judgeVideoCodec(
    raw: string | null | undefined,
    isTypeSupported: ((mime: string) => boolean) | null = defaultIsTypeSupported(),
): CodecVerdict {
    const probe = VIDEO_PROBES[normalizeCodecName(raw)];
    if (!probe || !isTypeSupported) return 'unknown';
    return isTypeSupported(probe) ? 'ok' : 'unplayable';
}

function defaultIsTypeSupported(): ((mime: string) => boolean) | null {
    if (typeof MediaSource === 'undefined') return null;
    return (mime) => MediaSource.isTypeSupported(mime);
}
