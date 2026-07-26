/**
 * A self-hosted CORS/HTTPS proxy for ThunderTV, deployable on Cloudflare
 * Workers' free tier (~100k requests/day) — the cheapest way to reach an
 * `http://` (or CORS-blocking) IPTV provider from the HTTPS-deployed web
 * app. GitHub Pages itself cannot do this: it serves static files only,
 * and `github.io` is HSTS-preloaded so the app can never be served over
 * plain http there.
 *
 * Deploy (no local tooling needed):
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker.
 *   2. Paste this file as the worker script and deploy. Note the
 *      `https://<name>.<account>.workers.dev` URL.
 *   3. (Recommended) In the worker's Settings → Variables, add
 *      `ALLOWED_HOSTS` = your provider's host(s), comma-separated, e.g.
 *      `provider.example:8080` — without it the worker is an open proxy
 *      anyone who finds the URL can abuse.
 *   4. In ThunderTV: Settings → Streaming → proxy template =
 *      `https://<name>.<account>.workers.dev/{url}`
 *
 * What it does with a request for `https://worker/<encodeURIComponent(target)>`:
 *   - forwards GET to the decoded target (http or https), following
 *     redirects (Xtream `/live/` URLs commonly 302 to a session URL);
 *   - adds `Access-Control-Allow-Origin: *` so the browser accepts it;
 *   - rewrites HLS manifests (.m3u8) so every variant/segment/key URI
 *     points back through this worker — hls.js fetches segments itself,
 *     so without this only the API would work and playback would still be
 *     mixed-content/CORS-blocked.
 *
 * Privacy note (mirrors the app's own proxy warning): every proxied URL —
 * including Xtream credentials embedded in it — is visible to this
 * worker's operator. Deploying it on your own account means that's you.
 */

const M3U8_CONTENT_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl'];

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
};

function corsResponse(body, init = {}) {
    const headers = new Headers(init.headers ?? {});
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(body, { ...init, headers });
}

function targetFromRequest(request) {
    const url = new URL(request.url);
    // Path style (the app's `https://worker/{url}` template): everything
    // after the leading slash, still percent-encoded. `?u=` works too.
    const raw = url.pathname.length > 1 ? url.pathname.slice(1) + url.search : (url.searchParams.get('u') ?? '');
    try {
        return new URL(decodeURIComponent(raw));
    } catch {
        return null;
    }
}

function hostAllowed(target, env) {
    const allowed = (env.ALLOWED_HOSTS ?? '').trim();
    if (!allowed) return true; // no allowlist configured — open (see header note)
    return allowed
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
        .includes(target.host.toLowerCase());
}

function looksLikeM3u8(target, contentType, bodyStart) {
    if (M3U8_CONTENT_TYPES.some((t) => contentType.includes(t))) return true;
    if (target.pathname.toLowerCase().endsWith('.m3u8')) return true;
    return bodyStart.trimStart().startsWith('#EXTM3U');
}

/** Rewrites every URI in an HLS manifest to route back through this worker, resolving relative URIs against the manifest's own final (post-redirect) URL. */
function rewriteManifest(text, baseUrl, workerOrigin) {
    const proxied = (uri) => `${workerOrigin}/${encodeURIComponent(new URL(uri, baseUrl).toString())}`;
    return text
        .split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (!trimmed.startsWith('#')) return proxied(trimmed);
            // Attribute-carried URIs: #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, ...
            return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxied(uri)}"`);
        })
        .join('\n');
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return corsResponse(null, { status: 204 });
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return corsResponse('method not allowed', { status: 405 });
        }

        const target = targetFromRequest(request);
        if (!target || (target.protocol !== 'http:' && target.protocol !== 'https:')) {
            return corsResponse('bad target url', { status: 400 });
        }
        if (!hostAllowed(target, env)) return corsResponse('host not allowed', { status: 403 });

        let upstream;
        try {
            upstream = await fetch(target.toString(), { method: request.method, redirect: 'follow' });
        } catch {
            return corsResponse('upstream fetch failed', { status: 502 });
        }

        const contentType = (upstream.headers.get('content-type') ?? '').toLowerCase();
        const headers = new Headers();
        if (upstream.headers.get('content-type')) headers.set('content-type', upstream.headers.get('content-type'));

        // Manifest? Read as text and rewrite; everything else streams through.
        if (request.method === 'GET' && upstream.ok) {
            const isSmallEnoughToSniff = contentType.startsWith('text/') || contentType === '' || M3U8_CONTENT_TYPES.some((t) => contentType.includes(t)) || target.pathname.toLowerCase().endsWith('.m3u8');
            if (isSmallEnoughToSniff) {
                const text = await upstream.text();
                if (looksLikeM3u8(target, contentType, text.slice(0, 16))) {
                    const workerOrigin = new URL(request.url).origin;
                    return corsResponse(rewriteManifest(text, upstream.url, workerOrigin), {
                        status: upstream.status,
                        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
                    });
                }
                return corsResponse(text, { status: upstream.status, headers });
            }
        }

        return corsResponse(upstream.body, { status: upstream.status, headers });
    },
};
