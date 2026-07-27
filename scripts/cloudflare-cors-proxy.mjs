/**
 * A self-hosted CORS/HTTPS proxy for ThunderTV, deployable on Cloudflare
 * Workers' free tier (~100k requests/day) — the cheapest way to reach an
 * `http://` (or CORS-blocking) IPTV provider from the HTTPS-deployed web
 * app. GitHub Pages itself cannot do this: it serves static files only,
 * and `github.io` is HSTS-preloaded so the app can never be served over
 * plain http there.
 *
 * Deploy (no local tooling needed):
 *   1. dash.cloudflare.com → Workers & Pages → Create → Worker (the plain
 *      "Hello World" starter — NOT "Import a repository").
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
 *   - forwards GET/HEAD (with the Range header) to the decoded target,
 *     following redirects (Xtream `/live/` URLs commonly 302 to a session
 *     URL) — Cloudflare only allows outbound fetches to standard ports
 *     plus 8080/8880/2052/2082/2086/2095 (http) and 2053/2083/2087/2096/
 *     8443 (https); a provider on an exotic port fails here, not in the app;
 *   - adds `Access-Control-Allow-Origin: *` so the browser accepts it;
 *   - detects HLS manifests by CONTENT (the first bytes reading `#EXTM3U`),
 *     never by extension alone — many Xtream panels answer an `.m3u8`
 *     request with a raw endless MPEG-TS stream, which must stream through
 *     untouched instead of being buffered as text (that hang is what an
 *     iPhone shows as a dead player);
 *   - rewrites detected manifests so every variant/segment/key URI points
 *     back through this worker — both hls.js and iOS's native HLS player
 *     fetch segments themselves, so without this only the API would work;
 *   - caches image responses (channel logos) at the Cloudflare edge so
 *     repeat logo loads don't spend upstream quota.
 *
 * Privacy note (mirrors the app's own proxy warning): every proxied URL —
 * including Xtream credentials embedded in it — is visible to this
 * worker's operator. Deploying it on your own account means that's you.
 */

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
};

/** A "manifest" larger than this is really a mislabeled stream — fall back to pass-through. Real HLS manifests are a few KB. */
const MANIFEST_MAX_BYTES = 2 * 1024 * 1024;

/** Upstream response headers forwarded to the browser (plus CORS). */
const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

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

function upstreamHeadersFor(request) {
    const headers = {};
    const range = request.headers.get('range');
    if (range) headers['range'] = range;
    return headers;
}

function passthroughHeaders(upstream) {
    const headers = new Headers();
    for (const name of PASSTHROUGH_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
    }
    return headers;
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

function concatChunks(chunks) {
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

/** Replays already-consumed chunks, then pumps the rest of the reader — the pass-through path for stream bodies whose prefix was read for sniffing. */
function streamFrom(chunks, reader) {
    let replayIndex = 0;
    return new ReadableStream({
        async pull(controller) {
            if (replayIndex < chunks.length) {
                controller.enqueue(chunks[replayIndex]);
                replayIndex += 1;
                return;
            }
            const { done, value } = await reader.read();
            if (done) controller.close();
            else controller.enqueue(value);
        },
        cancel(reason) {
            return reader.cancel(reason);
        },
    });
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') return corsResponse(null, { status: 204 });
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return corsResponse('method not allowed', { status: 405 });
        }

        const target = targetFromRequest(request);
        if (!target || (target.protocol !== 'http:' && target.protocol !== 'https:')) {
            return corsResponse('bad target url', { status: 400 });
        }
        if (!hostAllowed(target, env)) return corsResponse('host not allowed', { status: 403 });

        // Edge-cache hit (logos)?
        const cache = globalThis.caches?.default;
        if (cache && request.method === 'GET') {
            const hit = await cache.match(request.url);
            if (hit) return hit;
        }

        let upstream;
        try {
            upstream = await fetch(target.toString(), {
                method: request.method,
                redirect: 'follow',
                headers: upstreamHeadersFor(request),
            });
        } catch {
            return corsResponse('upstream fetch failed', { status: 502 });
        }

        const contentType = (upstream.headers.get('content-type') ?? '').toLowerCase();
        const headers = passthroughHeaders(upstream);

        if (request.method === 'HEAD' || !upstream.body) {
            return corsResponse(null, { status: upstream.status, headers });
        }

        // Content-based manifest sniff: read the smallest prefix that can
        // prove `#EXTM3U`, never the whole body — a raw MPEG-TS stream
        // (which some panels serve for .m3u8 URLs) must pass through as a
        // stream, not be buffered.
        const reader = upstream.body.getReader();
        const chunks = [];
        let total = 0;
        while (total < 16) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.byteLength;
        }

        const prefix = new TextDecoder().decode(concatChunks(chunks).slice(0, 16));
        if (upstream.ok && prefix.trimStart().startsWith('#EXTM3U')) {
            // Manifest: read the rest (bounded) and rewrite.
            let manifestOverflow = false;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                total += value.byteLength;
                if (total > MANIFEST_MAX_BYTES) {
                    manifestOverflow = true;
                    break;
                }
            }
            if (!manifestOverflow) {
                const text = new TextDecoder().decode(concatChunks(chunks));
                const workerOrigin = new URL(request.url).origin;
                return corsResponse(rewriteManifest(text, upstream.url, workerOrigin), {
                    status: upstream.status,
                    headers: { 'content-type': 'application/vnd.apple.mpegurl' },
                });
            }
        }

        // Everything else (segments, raw TS streams, JSON, images, error
        // bodies): stream through with upstream status + headers.
        const response = corsResponse(streamFrom(chunks, reader), { status: upstream.status, headers });

        if (cache && upstream.ok && request.method === 'GET' && contentType.startsWith('image/')) {
            const copy = response.clone();
            if (ctx?.waitUntil) ctx.waitUntil(cache.put(request.url, copy));
            else void cache.put(request.url, copy);
        }

        return response;
    },
};
