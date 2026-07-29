import { getPlatform } from '../core/platform';
import type { FetchFailure } from '../core/http';
import type { StorageAdapter } from '../core/storage';
import { feedUrls, plainFeedUrls, type EpgCountry } from './countries';

/**
 * Every byte this app fetches from `globetvapp/epg` goes through here
 * (Feature 31.2): gz-first (~13× smaller than plain — Feature 31.2.2/2.3),
 * conditional on the CDN's ETag (Feature 31.2.5), sequential with a fixed
 * spacing between files (never parallel — politeness), TTL-gated so a
 * reload inside the refresh window makes zero upstream requests (Feature
 * 31.2.6), and single-flight so overlapping callers share one fetch
 * (Feature 31.2.7). The upstream feeds refresh once daily at 03:00 UTC per
 * their own docs — 12h is comfortably inside that without re-fetching on
 * every reload.
 */
export const FEED_REFRESH_TTL_MS = 12 * 60 * 60 * 1000;

const REQUEST_SPACING_MS = 300;
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

interface FeedBookkeeping {
    etag: string | null;
    lastFetchedAt: number;
}

export type FeedFileOutcome = 'fetched' | 'not-modified' | 'skipped-fresh' | 'failed' | 'decode-error';

export interface FeedFileResult {
    url: string;
    outcome: FeedFileOutcome;
    /** Present only when `outcome === 'fetched'` — the decoded XML text. */
    text?: string;
    /** Present only when `outcome === 'failed'` — the classified HTTP-layer failure (Feature 31.2.9). */
    failure?: FetchFailure;
}

export interface FetchCountryFeedsResult {
    country: string;
    files: FeedFileResult[];
}

/** Keyed by folder — a second call for the same country while one is in flight awaits the same promise instead of racing a duplicate download (Feature 31.2.7). */
const inFlight = new Map<string, Promise<FetchCountryFeedsResult>>();

function bookkeepingKey(url: string): string {
    return `epg.feed.meta.${url}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Feature 31.2.3's capability probe — a plain `typeof` check, cheap enough to not need caching (and caching it would fix the result for the process's lifetime, which a test suite stubbing/unstubbing the global cannot work around). */
function supportsGzipDecompression(): boolean {
    return typeof DecompressionStream !== 'undefined';
}

/** Feature 31.2.4: gzip is decided by the payload's own magic bytes, never by URL or `Content-Type` — a proxy may transparently decode, or a CDN may mislabel. */
function looksGzipped(bytes: ArrayBuffer): boolean {
    if (bytes.byteLength < 2) return false;
    const head = new Uint8Array(bytes, 0, 2);
    return head[0] === GZIP_MAGIC_0 && head[1] === GZIP_MAGIC_1;
}

async function gunzipToText(bytes: ArrayBuffer): Promise<string> {
    const body = new Response(bytes).body;
    if (!body) return '';
    const stream = body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
}

/**
 * Fetches every feed file for `country`. `force` bypasses the TTL (wired to
 * the Settings manual-refresh action); everything else is fully automatic —
 * callers never construct URLs or manage ETags themselves.
 */
export function fetchCountryFeeds(
    country: EpgCountry,
    options: { force?: boolean } = {},
): Promise<FetchCountryFeedsResult> {
    const key = country.folder;
    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = runFetch(country, options.force ?? false).finally(() => {
        inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
}

/** Drops the ETag/TTL bookkeeping for every one of `country`'s feed files (both gz and plain-fallback URLs, since which one was in use last session isn't known) — Settings' "Clear EPG cache" action, so a forced re-fetch afterward is unconditional rather than one where a stale ETag could still 304 against a cache the user just asked to clear. */
export async function clearFeedBookkeeping(country: EpgCountry): Promise<void> {
    const storage = getPlatform().storage;
    const urls = [...feedUrls(country), ...plainFeedUrls(country)];
    await Promise.all(urls.map((url) => storage.delete(bookkeepingKey(url))));
}

async function runFetch(country: EpgCountry, force: boolean): Promise<FetchCountryFeedsResult> {
    const storage = getPlatform().storage;
    const useGzip = supportsGzipDecompression();
    // Feature 31.2.3's fallback: without DecompressionStream, fetch the
    // plain-XML URLs directly rather than shipping an inflate library.
    const urls = useGzip ? feedUrls(country) : plainFeedUrls(country);

    const files: FeedFileResult[] = [];
    for (let i = 0; i < urls.length; i++) {
        if (i > 0) await sleep(REQUEST_SPACING_MS);
        files.push(await fetchOneFile(storage, urls[i]!, force, useGzip));
    }
    return { country: country.folder, files };
}

async function fetchOneFile(
    storage: StorageAdapter,
    url: string,
    force: boolean,
    gzipped: boolean,
): Promise<FeedFileResult> {
    const key = bookkeepingKey(url);
    const bookkeeping = await storage.get<FeedBookkeeping>(key);
    const now = Date.now();

    if (!force && bookkeeping && now - bookkeeping.lastFetchedAt < FEED_REFRESH_TTL_MS) {
        return { url, outcome: 'skipped-fresh' };
    }

    const headers: Record<string, string> = {};
    if (bookkeeping?.etag) headers['If-None-Match'] = bookkeeping.etag;

    const result = await getPlatform().http.get(url, { headers, timeoutMs: 20_000 });

    if (result.kind === 'http' && result.status === 304) {
        await storage.set(key, { etag: bookkeeping?.etag ?? null, lastFetchedAt: now });
        return { url, outcome: 'not-modified' };
    }
    if (result.kind !== 'ok') {
        // Bookkeeping is written on failure too (Feature 31.2.6): without
        // it, a blocked/dead file would be retried on every reload inside
        // the TTL window instead of backing off until the next one.
        await storage.set(key, { etag: bookkeeping?.etag ?? null, lastFetchedAt: now });
        return { url, outcome: 'failed', failure: result };
    }

    try {
        const bytes = await result.res.arrayBuffer();
        const text = gzipped && looksGzipped(bytes) ? await gunzipToText(bytes) : new TextDecoder().decode(bytes);
        await storage.set(key, { etag: result.etag, lastFetchedAt: now });
        return { url, outcome: 'fetched', text };
    } catch {
        await storage.set(key, { etag: bookkeeping?.etag ?? null, lastFetchedAt: now });
        return { url, outcome: 'decode-error' };
    }
}
