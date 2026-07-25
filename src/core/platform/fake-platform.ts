/**
 * Test-only. `FakePlatform` gives every downstream phase a deterministic
 * double for `PlatformAdapter` — scripted HTTP, in-memory files, memory
 * storage — so specs never hit a real network, disk, or IndexedDB (Feature
 * 03.10.1). Import only from `*.spec.ts`; `scripts/check-dist.mjs` fails the
 * build if any symbol here reaches `dist/` (Feature 03.10.4).
 */
import type { ClassifiedFetchResult, FetchFailure, FetchFailureKind } from '../http/classified-fetch';
import type { HttpAdapter, HttpRequestOptions } from '../http/http-adapter';
import type { StorageAdapter } from '../storage/storage-adapter';
import { getPlatform, resetPlatformForTests, setPlatform } from './index';
import type { Capabilities } from './capabilities';
import type { FileAdapter, PickedFile, ReadTextResult } from './file-adapter';
import type { PlatformAdapter } from './platform-adapter';

export interface ScriptedReply {
    kind: FetchFailureKind | 'ok';
    body?: string;
    status?: number;
    headers?: Record<string, string>;
    crossOrigin?: boolean;
    offlineHint?: boolean;
    limitBytes?: number;
}

interface RecordedCall {
    url: string;
    options?: HttpRequestOptions | undefined;
}

/** Scriptable route table (Feature 03.10.1): `onGet(url).reply(...)` before any `get()` call for that URL, or the fake throws — a spec forgetting to script a route fails loudly instead of silently hitting real `fetch`. */
export class FakeHttpAdapter implements HttpAdapter {
    private readonly routes = new Map<string, ScriptedReply>();
    readonly calls: RecordedCall[] = [];

    onGet(url: string): { reply: (reply: ScriptedReply) => void } {
        return { reply: (reply) => this.routes.set(url, reply) };
    }

    reset(): void {
        this.routes.clear();
        this.calls.length = 0;
    }

    // Not `async`: a missing scripted route throws synchronously (a
    // programmer error in the spec, not a classified failure) — specs
    // assert it via `expect(() => fakeHttp.get(url)).toThrow()`, not a
    // rejected promise. Every real reply path still returns a Promise.
    get(url: string, options?: HttpRequestOptions): Promise<ClassifiedFetchResult> {
        this.calls.push({ url, options });
        const scripted = this.routes.get(url);
        if (!scripted) {
            throw new Error(`FakeHttpAdapter: no scripted reply for "${url}" — call onGet(url).reply(...) first.`);
        }
        if (scripted.kind === 'ok') {
            const res = new Response(scripted.body ?? '', {
                status: scripted.status ?? 200,
                ...(scripted.headers ? { headers: scripted.headers } : {}),
            });
            return Promise.resolve({
                kind: 'ok',
                res,
                etag: res.headers.get('etag'),
                lastModified: res.headers.get('last-modified'),
            });
        }
        // scripted.kind !== 'ok' here (the branch above already returned for
        // 'ok'); TS narrows the `.kind` read but not the whole-object type
        // against buildScriptedFailure's narrower parameter, hence the cast.
        return Promise.resolve(
            buildScriptedFailure(scripted as Omit<ScriptedReply, 'kind'> & { kind: FetchFailureKind }),
        );
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

function buildScriptedFailure(scripted: Omit<ScriptedReply, 'kind'> & { kind: FetchFailureKind }): FetchFailure {
    switch (scripted.kind) {
        case 'http':
            return { kind: 'http', status: scripted.status ?? 500 };
        case 'timeout':
            return { kind: 'timeout' };
        case 'cors-or-network':
            return {
                kind: 'cors-or-network',
                crossOrigin: scripted.crossOrigin ?? true,
                offlineHint: scripted.offlineHint ?? false,
            };
        case 'mixed-content':
            return { kind: 'mixed-content' };
        case 'too-large':
            return { kind: 'too-large', limitBytes: scripted.limitBytes ?? 0 };
    }
}

/** In-memory files seeded before a spec triggers the picker — no real dialog, no real gesture requirement. */
export class FakeFileAdapter implements FileAdapter {
    private readonly queue: PickedFile[] = [];
    readonly picks: string[] = [];

    seed(file: PickedFile): void {
        this.queue.push(file);
    }

    reset(): void {
        this.queue.length = 0;
        this.picks.length = 0;
    }

    pickFile(accept: string): Promise<PickedFile | null> {
        this.picks.push(accept);
        return Promise.resolve(this.queue.shift() ?? null);
    }

    async readText(file: File): Promise<ReadTextResult> {
        return { kind: 'ok', text: await file.text() };
    }
}

export class MemoryStorage implements StorageAdapter {
    private readonly map = new Map<string, unknown>();

    get<T>(key: string): Promise<T | undefined> {
        return Promise.resolve(this.map.get(key) as T | undefined);
    }
    set<T>(key: string, value: T): Promise<void> {
        this.map.set(key, value);
        return Promise.resolve();
    }
    delete(key: string): Promise<void> {
        this.map.delete(key);
        return Promise.resolve();
    }
    clear(): Promise<void> {
        this.map.clear();
        return Promise.resolve();
    }
    reset(): void {
        this.map.clear();
    }
}

export interface FakePlatformHandle {
    platform: PlatformAdapter;
    http: FakeHttpAdapter;
    files: FakeFileAdapter;
    storage: MemoryStorage;
}

const DEFAULT_CAPABILITIES: Capabilities = Object.freeze({
    corsUnrestricted: false,
    externalPlayers: false,
    durableStorage: 'none',
});

export function createFakePlatform(capabilityOverrides: Partial<Capabilities> = {}): FakePlatformHandle {
    const http = new FakeHttpAdapter();
    const files = new FakeFileAdapter();
    const storage = new MemoryStorage();
    const platform: PlatformAdapter = {
        name: 'web',
        http,
        files,
        storage,
        capabilities: Object.freeze({ ...DEFAULT_CAPABILITIES, ...capabilityOverrides }),
    };
    return { platform, http, files, storage };
}

/**
 * Test harness (Feature 03.10.5): installs a `FakePlatform` for the
 * duration of `fn`, then restores the accessor — so specs never leak
 * platform state into unrelated tests. Downstream phases test against this,
 * never live network (Feature 03.10.9).
 */
export async function withFakePlatform<T>(
    capabilityOverrides: Partial<Capabilities>,
    fn: (handle: FakePlatformHandle) => Promise<T> | T,
): Promise<T> {
    const handle = createFakePlatform(capabilityOverrides);
    resetPlatformForTests();
    setPlatform(handle.platform);
    try {
        return await fn(handle);
    } finally {
        resetPlatformForTests();
    }
}

/** Re-exported so specs don't need a second import for the common "is this the fake?" sanity check. */
export { getPlatform };
