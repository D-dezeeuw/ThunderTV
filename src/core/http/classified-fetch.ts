/**
 * A CORS block, a DNS failure, and being offline all reject `fetch` with the
 * same opaque `TypeError` — this turns that into specific, honest UX
 * (masterplan §5.2, §5.9, §8) instead of a generic "network error".
 *
 * Every failure kind below must be handled by callers exhaustively (see the
 * `never` check pattern in `assertUnreachableFailure`) so a new kind can
 * never silently fall through to a generic message.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchOkResult {
    kind: 'ok';
    /** Raw `Response`, deliberately left unread — Feature 03.4.8, so a streaming consumer (e.g. the Phase 16 gzip XMLTV path) can read the body itself. */
    res: Response;
    etag: string | null;
    lastModified: string | null;
}

interface FailureBase {
    /** Set by `WebHttpAdapter` when this request went through a configured proxy — Feature 03.6.4. */
    viaProxy?: boolean;
}

export interface FetchHttpFailure extends FailureBase {
    kind: 'http';
    status: number;
}

export interface FetchTimeoutFailure extends FailureBase {
    kind: 'timeout';
}

export interface FetchCorsOrNetworkFailure extends FailureBase {
    kind: 'cors-or-network';
    /** True when the target is cross-origin — lets the UI say "almost certainly CORS" only when it plausibly is. */
    crossOrigin: boolean;
    /** True when `navigator.onLine` is false — distinguishes "you appear offline" from "the provider blocked this". */
    offlineHint: boolean;
}

export interface FetchMixedContentFailure extends FailureBase {
    kind: 'mixed-content';
}

export interface FetchTooLargeFailure extends FailureBase {
    kind: 'too-large';
    limitBytes: number;
}

export type FetchFailure =
    | FetchHttpFailure
    | FetchTimeoutFailure
    | FetchCorsOrNetworkFailure
    | FetchMixedContentFailure
    | FetchTooLargeFailure;

export type ClassifiedFetchResult = FetchOkResult | FetchFailure;
export type FetchFailureKind = FetchFailure['kind'];

export interface ClassifiedFetchInit extends Omit<RequestInit, 'signal' | 'headers'> {
    /** Widened to plain string records only — every caller in this codebase builds headers as `Record<string, string>`, never a `Headers` instance or tuple array. */
    headers?: Record<string, string> | undefined;
    signal?: AbortSignal | undefined;
    timeoutMs?: number | undefined;
    /** Streamed byte guard — see `capBodyBytes` below (Feature 03.4.7). */
    maxBytes?: number | undefined;
}

/**
 * An `https:` page cannot load `http:` streams; the browser just fails with
 * no visible error. Detect it before attempting the request (masterplan
 * §5.9) — ported verbatim from the reference sample.
 */
export function mixedContentBlocked(streamUrl: string): boolean {
    return location.protocol === 'https:' && new URL(streamUrl).protocol === 'http:';
}

export async function classifiedFetch(
    url: string,
    init: ClassifiedFetchInit = {},
): Promise<ClassifiedFetchResult> {
    const { timeoutMs, maxBytes, signal: callerSignal, headers, ...restInit } = init;

    if (isMixedContent(url)) {
        return { kind: 'mixed-content' };
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = callerSignal ? combineSignals(callerSignal, timeoutSignal) : timeoutSignal;

    try {
        const res = await fetch(url, { ...restInit, ...(headers !== undefined ? { headers } : {}), signal });
        if (!res.ok) {
            return { kind: 'http', status: res.status };
        }
        if (maxBytes !== undefined) {
            if (isOversizedByHeader(res, maxBytes)) {
                await res.body?.cancel();
                return { kind: 'too-large', limitBytes: maxBytes };
            }
        }
        return {
            kind: 'ok',
            res: maxBytes !== undefined ? capBodyBytes(res, maxBytes) : res,
            etag: res.headers.get('etag'),
            lastModified: res.headers.get('last-modified'),
        };
    } catch (e) {
        if (hasName(e, 'TimeoutError')) {
            return { kind: 'timeout' };
        }
        // A caller-initiated abort is not a classified failure — the caller
        // already knows it aborted; let the rejection propagate to them.
        if (hasName(e, 'AbortError') && callerSignal?.aborted) {
            throw e;
        }
        // Anything else here — offline, DNS failure, or (most commonly for
        // IPTV providers) a CORS block — rejects with the same opaque
        // TypeError. Don't guess further than the two signals available.
        return {
            kind: 'cors-or-network',
            crossOrigin: safeCrossOrigin(url),
            offlineHint: !navigator.onLine,
        };
    }
}

/**
 * Checks `.name` by duck-typing rather than `e instanceof DOMException`.
 * Found while testing this module under jsdom: `AbortController`/`fetch`
 * abort/timeout errors come from Node's own DOMException implementation,
 * while a jsdom-hosted test's global `DOMException` is jsdom's separate
 * class — `instanceof` across that realm split is `false` even though
 * `.name` is correct on both sides. Duck-typing sidesteps the mismatch and
 * is exactly as correct in production, where only one realm exists anyway.
 */
function hasName(e: unknown, name: string): boolean {
    return typeof e === 'object' && e !== null && 'name' in e && e.name === name;
}

/** `new URL()` throws on a relative/invalid URL — classification must never throw itself (Feature 03.5.9), so both origin checks below go through this guard. */
function isMixedContent(url: string): boolean {
    try {
        return mixedContentBlocked(url);
    } catch {
        return false;
    }
}

function safeCrossOrigin(url: string): boolean {
    try {
        return new URL(url, location.href).origin !== location.origin;
    } catch {
        return false;
    }
}

/**
 * Cheap defensive guard (Feature 03.4.7): a `Content-Length` over the limit
 * fails before any byte is read. A response without `Content-Length`
 * (chunked) can't be judged upfront without consuming the body — which
 * would break Feature 03.4.8's "keep the Response open for the caller"
 * contract — so `capBodyBytes` below enforces the limit lazily as the
 * caller actually reads the (still-open) body instead.
 */
function isOversizedByHeader(res: Response, maxBytes: number): boolean {
    const contentLength = res.headers.get('content-length');
    return contentLength !== null && Number(contentLength) > maxBytes;
}

/** Wraps the body in a byte-counting stream so an unbounded chunked response still can't balloon memory past `maxBytes` once the caller starts reading it. */
function capBodyBytes(res: Response, maxBytes: number): Response {
    if (!res.body) return res;
    let seen = 0;
    const capped = res.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                seen += chunk.byteLength;
                if (seen > maxBytes) {
                    controller.error(new Error(`response body exceeded maxBytes (${String(maxBytes)})`));
                    return;
                }
                controller.enqueue(chunk);
            },
        }),
    );
    return new Response(capped, res);
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
    if (typeof AbortSignal.any === 'function') {
        return AbortSignal.any([a, b]);
    }
    // Fallback for engines without AbortSignal.any (Feature 03.4.2) — some
    // older TV webviews are the target here, not evergreen desktop browsers.
    const controller = new AbortController();
    const forward = (source: AbortSignal) => () => controller.abort(source.reason);
    a.addEventListener('abort', forward(a), { once: true });
    b.addEventListener('abort', forward(b), { once: true });
    if (a.aborted) controller.abort(a.reason);
    if (b.aborted) controller.abort(b.reason);
    return controller.signal;
}
