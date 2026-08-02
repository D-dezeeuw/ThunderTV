/**
 * Ambient declaration for `cloudflare-cors-proxy.mjs` — the Cloudflare
 * Worker module, plain JS like its neighbours (`allowJs` stays `false`
 * project-wide, Feature 01.2). It exists because the worker is no longer
 * imported only by `proxy-server.mjs`: `desktop/transcode.mjs` reads
 * `PLAYER_USER_AGENT` from it so ffmpeg introduces itself to a panel exactly
 * as the proxy does, and `transcode.spec.mts` asserts that under type
 * checking.
 */

/** The identity every ThunderTV request to a provider goes out under — panels that 403 an unrecognized player accept this one. */
export declare const PLAYER_USER_AGENT: string;

declare const worker: { fetch(request: Request, env: Record<string, string>): Promise<Response> };
export default worker;
