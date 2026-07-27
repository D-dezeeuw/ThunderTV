/**
 * MVP playback engine: a single `<video>` element driven by hls.js
 * (dynamically imported so the ~150 kB library never lands in the initial
 * bundle) with a native-HLS path for Safari/iOS, which refuses a second
 * decoder for a format it already ships natively.
 *
 * Fatal failures on either path report through `reportPlaybackError()`
 * (rendered in the player bar) — on a phone there is no devtools console,
 * so a dead stream must say why on screen.
 *
 * Full multi-engine selection (native/hls.js/mpegts.js) is Phase 11's
 * scope — this is the minimum real player needed to prove a channel
 * actually plays.
 */
import type Hls from 'hls.js';
import { getPlatform } from '../core/platform';
import { reportPlaybackError } from '../state/player.actions';

let hls: Hls | null = null;
let nativeErrorHandler: (() => void) | null = null;
let nativeErrorVideo: HTMLVideoElement | null = null;
let lastStreamUrl: string | null = null;

function supportsNativeHls(video: HTMLVideoElement): boolean {
    return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/** MediaError codes → readable labels (`video.error.message` is empty on most browsers). */
const MEDIA_ERROR_LABELS: Record<number, string> = {
    1: 'aborted',
    2: 'network error',
    3: 'decode error',
    4: 'source not supported',
};

function attachNativeErrorReporting(video: HTMLVideoElement): void {
    const handler = (): void => {
        const err = video.error;
        const label = err ? (MEDIA_ERROR_LABELS[err.code] ?? `code ${String(err.code)}`) : 'unknown';
        const detail = err?.message ? `${label} — ${err.message}` : label;
        console.error('[ThunderTV] native playback error:', detail);
        reportPlaybackError(detail);
        appendStreamProbe(detail);
    };
    video.addEventListener('error', handler);
    nativeErrorHandler = handler;
    nativeErrorVideo = video;
}

/**
 * "Source not supported" alone cannot distinguish the two realities behind
 * a dead IPTV stream: a panel answering the HLS URL with something that
 * is not HLS at all, vs. a perfectly valid manifest whose codecs this
 * device refuses (iOS rejects HEVC in TS segments, the common "4K"
 * channel setup). On failure, fetch the stream's first bytes and say
 * which — the message is the diagnostic a phone screenshot can carry.
 * Dynamic technical detail, same central-strings exemption as the 'm3u'
 * error kind (Feature 07.4.3's documented exception).
 */
function appendStreamProbe(baseDetail: string): void {
    const url = lastStreamUrl;
    if (!url) return;
    void describeStream(url).then((summary) => {
        reportPlaybackError(`${baseDetail} — ${summary}`);
    });
}

/** Probes the played URL, and — when it carries a recognizable stream extension — the alternate Xtream output format too, so one error line settles "is it this format, or the provider refusing streams entirely". */
async function describeStream(url: string): Promise<string> {
    const primary = await describeOneUrl(url);
    const alt = alternateFormatUrl(url);
    if (!alt) return primary;
    const altVerdict = await describeOneUrl(alt.url);
    return `${primary}; ${alt.label} variant: ${altVerdict}`;
}

/** Swaps `.m3u8` ↔ `.ts` on the URL tail — works on the proxied form too, since `encodeURIComponent` leaves dots and letters intact. */
function alternateFormatUrl(url: string): { url: string; label: string } | null {
    if (url.endsWith('.m3u8')) return { url: `${url.slice(0, -'.m3u8'.length)}.ts`, label: '.ts' };
    if (url.endsWith('.ts')) return { url: `${url.slice(0, -'.ts'.length)}.m3u8`, label: '.m3u8' };
    return null;
}

async function describeOneUrl(url: string): Promise<string> {
    try {
        const result = await getPlatform().http.get(url, { timeoutMs: 8000 });
        if (result.kind === 'http') return `HTTP ${String(result.status)} from provider`;
        if (result.kind !== 'ok') return `stream fetch failed (${result.kind})`;
        const body = result.res.body;
        if (!body) return 'empty response';
        // First chunk only, then cancel — a raw live TS feed is endless and
        // must never be buffered whole (the exact bug the proxy had).
        const reader = body.getReader();
        const { value } = await reader.read();
        void reader.cancel().catch(() => undefined);
        if (!value || value.byteLength === 0) return 'empty response';

        const text = new TextDecoder().decode(value.slice(0, 4096));
        if (text.trimStart().startsWith('#EXTM3U')) {
            const codecs = /CODECS="([^"]+)"/.exec(text)?.[1];
            if (codecs) {
                const hevc = /hvc1|hev1/i.test(codecs) ? ' (HEVC — iPhones only accept HEVC in fMP4 segments, not TS)' : '';
                return `HLS manifest OK, codecs ${codecs}${hevc}`;
            }
            return 'HLS manifest OK — segment format or codec unsupported on this device';
        }
        if (value[0] === 0x47) return 'raw MPEG-TS stream — browsers cannot play this';
        if (text.trimStart().startsWith('<')) return 'HTML page (login/error) instead of a stream';
        if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) return 'JSON error instead of a stream';
        return 'unrecognized stream data';
    } catch {
        return 'stream probe failed';
    }
}

export async function attachAndPlay(video: HTMLVideoElement, streamUrl: string): Promise<void> {
    detach(video);
    reportPlaybackError(null);
    lastStreamUrl = streamUrl;
    attachNativeErrorReporting(video);

    if (supportsNativeHls(video)) {
        video.src = streamUrl;
        await video.play().catch(() => undefined);
        return;
    }

    const { default: HlsCtor } = await import('hls.js');
    if (!HlsCtor.isSupported()) {
        // Last-resort fallback (e.g. a raw .ts MPEG-TS URL) — let the
        // browser's own media pipeline try rather than failing outright.
        video.src = streamUrl;
        await video.play().catch(() => undefined);
        return;
    }

    const instance = new HlsCtor();
    hls = instance;
    instance.loadSource(streamUrl);
    instance.attachMedia(video);
    instance.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => undefined);
    });
    instance.on(HlsCtor.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        console.error('[ThunderTV] hls.js fatal error:', data.type, data.details);
        reportPlaybackError(`${data.type}: ${data.details}`);
        appendStreamProbe(`${data.type}: ${data.details}`);
    });
}

export function detach(video: HTMLVideoElement): void {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    if (nativeErrorHandler && nativeErrorVideo) {
        nativeErrorVideo.removeEventListener('error', nativeErrorHandler);
        nativeErrorHandler = null;
        nativeErrorVideo = null;
    }
    video.removeAttribute('src');
    video.load();
}

/** Test-only reset — mirrors `resetVirtualListForTests()`'s convention (Phase 08). @internal */
export function resetPlayerEngineForTests(): void {
    hls = null;
    nativeErrorHandler = null;
    nativeErrorVideo = null;
    lastStreamUrl = null;
}
