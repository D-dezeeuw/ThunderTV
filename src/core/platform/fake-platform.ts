/**
 * Test-only. `FakePlatform` gives every downstream phase a deterministic
 * double for `PlatformAdapter` — scripted HTTP, in-memory files, memory
 * storage — so specs never hit a real network, disk, or IndexedDB (Feature
 * 03.10.1). Import only from `*.spec.ts`; `scripts/check-dist.mjs` fails the
 * build if any symbol here reaches `dist/` (Feature 03.10.4).
 */
import type { ClassifiedFetchResult, FetchFailure, FetchFailureKind } from '../http/classified-fetch';
import type { HttpAdapter, HttpRequestOptions } from '../http/http-adapter';
import { MemoryStorage } from '../storage/memory-storage';
import { getPlatform, resetPlatformForTests, setPlatform } from './index';
import type { Capabilities } from './capabilities';
import type {
    DownloadAdapter,
    DownloadCallbacks,
    DownloadFailure,
    DownloadHandle,
    DownloadTarget,
} from './download-adapter';
import type { ElectronBridge } from './electron-bridge.types';
import type { FileAdapter, PickedFile, ReadTextResult } from './file-adapter';
import type { PlatformAdapter, WindowFullscreenControl } from './platform-adapter';

export interface ScriptedReply {
    /** `'pending'` (Feature 07.9.1) never resolves on its own — it rejects with a real `AbortError`-named error the moment the call's `signal` aborts, exactly matching `fetch()`'s own contract, so specs can exercise mid-fetch cancellation without a real network gap. */
    kind: FetchFailureKind | 'ok' | 'pending';
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
        if (scripted.kind === 'pending') {
            return new Promise((_resolve, reject) => {
                options?.signal?.addEventListener('abort', () => {
                    const err = new Error('The operation was aborted.');
                    err.name = 'AbortError';
                    reject(err);
                });
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

/**
 * Test-only `WindowFullscreenControl` (`PlatformAdapter.windowFullscreen`)
 * — the desktop shell's window-fullscreen fallback without a desktop
 * shell. `calls` records every request in order, so a spec can tell "never
 * asked" apart from "asked, then asked to come back out".
 */
export class FakeWindowFullscreen implements WindowFullscreenControl {
    private fullscreen = false;
    readonly calls: boolean[] = [];

    isFullscreen(): boolean {
        return this.fullscreen;
    }

    setFullscreen(next: boolean): void {
        this.fullscreen = next;
        this.calls.push(next);
    }
}

/**
 * Test-only stand-in for the `window.electron` bridge `desktop/preload.cjs`
 * exposes. The fullscreen members are backed by a real boolean, mirroring
 * the preload's own cached state, so a spec that flips one reads it back.
 */
export function fakeElectronBridge(proxyOrigin = 'http://127.0.0.1:52301'): ElectronBridge {
    let fullscreen = false;
    return {
        proxyOrigin,
        appVersion: '0.0.0',
        isWindowFullscreen: () => fullscreen,
        setWindowFullscreen: (next) => {
            fullscreen = next;
        },
        getDefaultConfig: () => Promise.resolve({ xtream: null, locale: null, liveCountry: null }),
        // Declines every save dialog, so a spec that merely installs the
        // bridge never accidentally starts a transfer. A spec exercising the
        // desktop download path overrides this member on the returned object.
        downloads: {
            prepare: () => Promise.resolve(null),
            start: () => undefined,
            cancel: () => undefined,
            onEvent: () => () => undefined,
        },
    };
}

/**
 * Test-only `DownloadAdapter`. Nothing is transferred and nothing is
 * written: a spec drives the outcome by hand through `emitProgress()`/
 * `finish()`/`fail()`, which is what makes an inherently asynchronous,
 * multi-second operation testable in one synchronous pass.
 *
 * `prepare()` answers a target by default so the common case needs no
 * setup; `declineNextPrepare()` makes it answer `null` once, standing in
 * for a viewer who dismisses the save picker.
 */
export class FakeDownloadAdapter implements DownloadAdapter {
    /** Every `start()` in order — a spec asserts what was actually requested, not just that something was. */
    readonly started: { url: string; filename: string }[] = [];
    readonly prepared: string[] = [];
    readonly cancelled: string[] = [];
    /** What `prepare()` answers with. Flip to `'handoff'` to exercise the browser-download-manager path, which is terminal on arrival. */
    prepareKind: DownloadTarget['kind'] = 'managed';
    private declineOnce = false;
    private live: { filename: string; callbacks: DownloadCallbacks } | null = null;

    declineNextPrepare(): void {
        this.declineOnce = true;
    }

    prepare(filename: string): Promise<DownloadTarget | null> {
        this.prepared.push(filename);
        if (this.declineOnce) {
            this.declineOnce = false;
            return Promise.resolve(null);
        }
        return Promise.resolve({ kind: this.prepareKind, filename });
    }

    start(url: string, target: DownloadTarget, callbacks: DownloadCallbacks): DownloadHandle {
        this.started.push({ url, filename: target.filename });
        this.live = { filename: target.filename, callbacks };
        return {
            cancel: () => {
                this.cancelled.push(target.filename);
                this.fail('cancelled');
            },
        };
    }

    emitProgress(receivedBytes: number, totalBytes: number | null): void {
        this.live?.callbacks.onProgress({ receivedBytes, totalBytes });
    }

    finish(): void {
        const live = this.live;
        this.live = null;
        live?.callbacks.onDone();
    }

    fail(reason: DownloadFailure): void {
        const live = this.live;
        this.live = null;
        live?.callbacks.onError(reason);
    }

    reset(): void {
        this.started.length = 0;
        this.prepared.length = 0;
        this.cancelled.length = 0;
        this.declineOnce = false;
        this.prepareKind = 'managed';
        this.live = null;
    }
}

export interface FakePlatformHandle {
    platform: PlatformAdapter;
    http: FakeHttpAdapter;
    files: FakeFileAdapter;
    downloads: FakeDownloadAdapter;
    storage: MemoryStorage;
}

const DEFAULT_CAPABILITIES: Capabilities = Object.freeze({
    corsUnrestricted: false,
    externalPlayers: false,
    durableStorage: 'none',
    // `'managed'` by default so the common spec exercises the real queue
    // (progress + cancel). A spec covering the browser-handoff path
    // overrides it, same as any other capability.
    downloads: 'managed',
});

export function createFakePlatform(capabilityOverrides: Partial<Capabilities> = {}): FakePlatformHandle {
    const http = new FakeHttpAdapter();
    const files = new FakeFileAdapter();
    const downloads = new FakeDownloadAdapter();
    const storage = new MemoryStorage();
    const capabilities = Object.freeze({ ...DEFAULT_CAPABILITIES, ...capabilityOverrides });
    // MemoryStorage always reports tier 'none' — override it to match the
    // requested capabilities.durableStorage so code that branches on
    // `getPlatform().storage.tier` (e.g. Feature 04.8.5's dismissal policy)
    // sees a consistent fake, without needing a second storage
    // implementation just for tests.
    Object.defineProperty(storage, 'tier', { value: capabilities.durableStorage });
    const platform: PlatformAdapter = { name: 'web', http, files, downloads, storage, capabilities };
    return { platform, http, files, downloads, storage };
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
/** Re-exported for convenience — `FakePlatformHandle.storage`'s real type (Feature 04.3.9: the fake now uses the real reference implementation, not a Phase 03 placeholder). */
export { MemoryStorage };
