/**
 * The desktop shell's audio-transcode route, as the renderer sees it: one
 * function that turns "this film, from this second" into a localhost URL
 * whose audio the browser can actually decode.
 *
 * Present only on a host that owns a transcoder — the Electron shell, which
 * bundles ffmpeg and runs it in the main process (`desktop/transcode.mjs`).
 * Absent on web and on TV, where the honest answer to an AC-3 soundtrack
 * remains the message `src/player/audio-output.ts` publishes. That absence
 * *is* the capability check, the same way `windowFullscreen` works
 * (`platform-adapter.ts`) — rather than a `capabilities` boolean that would
 * be a second copy of "is the member there" and could drift from it.
 */

export interface AudioTranscodeControl {
    /**
     * Opens the transcoded stream, from `atSeconds` into the film. Resolves
     * the raw `Response`, because the player needs both halves of it: the
     * headers carry the film's real duration (which the fragmented MP4
     * itself cannot), and the body is an endless read the caller pumps into
     * a SourceBuffer at its own pace.
     *
     * The request itself lives here rather than in `src/player/` for the
     * ordinary reason (Feature 03.9: no `fetch` outside `src/core/`) — and
     * `sourceUrl` is the provider's own URL, unproxied, since ffmpeg runs in
     * the main process where there is no CORS policy to satisfy and no
     * reason to take an extra hop through the loopback proxy.
     */
    open(sourceUrl: string, atSeconds: number, signal: AbortSignal): Promise<Response>;
}

/**
 * Kept pure and separate from the adapter so the escaping is testable
 * without a bridge: a provider URL routinely carries `?`, `&` and `+`
 * (session tokens, credentials in the path), and a single unescaped one
 * turns "play this film" into "play this other thing, seeking to whatever
 * the query said".
 */
export function buildTranscodeStreamUrl(origin: string, token: string, sourceUrl: string, atSeconds: number): string {
    const at = Number.isFinite(atSeconds) && atSeconds > 0 ? atSeconds : 0;
    const params = new URLSearchParams({ token, t: at.toFixed(3), src: sourceUrl });
    return `${origin.replace(/\/+$/, '')}/stream?${params.toString()}`;
}
