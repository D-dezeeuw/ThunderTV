import { classifiedFetch, type ClassifiedFetchResult } from './classified-fetch';
import type { HttpAdapter, HttpRequestOptions } from './http-adapter';
import { applyProxy } from './proxy';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface WebHttpAdapterOptions {
    /** Constructor-injected getter (Feature 03.6.3) — Spektrum-state-backed once Settings (Phase 22) exists. Returns undefined/empty for "no proxy configured". */
    getProxyTemplate?: () => string | undefined;
    defaultTimeoutMs?: number;
}

export class WebHttpAdapter implements HttpAdapter {
    private readonly getProxyTemplate: () => string | undefined;
    private readonly defaultTimeoutMs: number;

    constructor(options: WebHttpAdapterOptions = {}) {
        this.getProxyTemplate = options.getProxyTemplate ?? (() => undefined);
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    async get(url: string, options: HttpRequestOptions = {}): Promise<ClassifiedFetchResult> {
        const template = options.noProxy ? undefined : this.getProxyTemplate();
        const target = options.noProxy ? url : applyProxy(template, url);
        const viaProxy = target !== url;

        const result = await classifiedFetch(target, {
            headers: options.headers,
            signal: options.signal,
            timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
            maxBytes: options.maxBytes,
        });

        // A failure against the proxy origin is a proxy failure, not a
        // provider failure — Feature 03.6.4 — so error copy can say the
        // proxy itself failed rather than blaming the IPTV provider.
        return result.kind !== 'ok' && viaProxy ? { ...result, viaProxy: true } : result;
    }

    async getText(url: string, options?: HttpRequestOptions): Promise<string | null> {
        const result = await this.get(url, options);
        return result.kind === 'ok' ? result.res.text() : null;
    }

    async getJson<T = unknown>(url: string, options?: HttpRequestOptions): Promise<T | null> {
        const text = await this.getText(url, options);
        if (text === null) return null;
        try {
            return JSON.parse(text) as T;
        } catch {
            return null;
        }
    }
}
