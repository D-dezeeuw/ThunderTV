import { getPlatform } from '../core/platform';

/**
 * Playback-failure diagnostics. A bare MediaError label ("source not
 * supported") cannot distinguish the realities behind a dead IPTV stream:
 * a panel answering the HLS URL with something that is not HLS, a valid
 * manifest whose codecs this device refuses (iOS rejects HEVC in TS
 * segments), a provider blocking the request, or a login page. On failure
 * the engine fetches the stream's first bytes and appends what it actually
 * found — the message is the diagnostic a phone screenshot can carry.
 * Dynamic technical detail, same central-strings exemption as the `'m3u'`
 * error kind (Feature 07.4.3's documented exception).
 */

/** Probes the played URL, and — when it carries a recognizable stream extension — the alternate Xtream output format too, so one error line settles "is it this format, or the provider refusing streams entirely". */
export async function describeStream(url: string): Promise<string> {
    const primary = await describeOneUrl(url);
    const alt = alternateFormatUrl(url);
    if (!alt) return primary;
    const altVerdict = await describeOneUrl(alt.url);
    return `${primary}; ${alt.label} variant: ${altVerdict}`;
}

/** Swaps `.m3u8` ↔ `.ts` on the URL tail — works on the proxied form too, since `encodeURIComponent` leaves dots and letters intact. */
export function alternateFormatUrl(url: string): { url: string; label: string } | null {
    if (url.endsWith('.m3u8')) return { url: `${url.slice(0, -'.m3u8'.length)}.ts`, label: '.ts' };
    if (url.endsWith('.ts')) return { url: `${url.slice(0, -'.ts'.length)}.m3u8`, label: '.m3u8' };
    return null;
}

export async function describeOneUrl(url: string): Promise<string> {
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
        if (value[0] === 0x47) return 'raw MPEG-TS stream';
        if (text.trimStart().startsWith('<')) return 'HTML page (login/error) instead of a stream';
        if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) return 'JSON error instead of a stream';
        return 'unrecognized stream data';
    } catch {
        return 'stream probe failed';
    }
}
