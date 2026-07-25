import type { ClassifiedFetchResult } from './classified-fetch';

export interface HttpRequestOptions {
    headers?: Record<string, string>;
    timeoutMs?: number;
    /** Combined with the adapter's own timeout signal — either firing aborts the request. */
    signal?: AbortSignal;
    /** Skip proxy template application for this call even if one is configured — Feature 03.6.7. */
    noProxy?: boolean;
    /** Streamed byte guard — Feature 03.4.7. */
    maxBytes?: number;
}

/**
 * The `PlatformAdapter.http` contract. `WebHttpAdapter` implements it today
 * via `fetch`; a future Electron adapter backed by `net.request` over IPC
 * (no CORS) implements it identically — callers never know which is active.
 */
export interface HttpAdapter {
    get(url: string, options?: HttpRequestOptions): Promise<ClassifiedFetchResult>;
    /** Convenience over `get()` — resolves `null` for any classified failure instead of the full result. Use `get()` directly when the failure kind matters. */
    getText(url: string, options?: HttpRequestOptions): Promise<string | null>;
    /** Convenience over `getText()` — resolves `null` on a classified failure or invalid JSON. */
    getJson<T = unknown>(url: string, options?: HttpRequestOptions): Promise<T | null>;
}
