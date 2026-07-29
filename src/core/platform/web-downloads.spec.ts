import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DownloadFailure, DownloadProgress } from './download-adapter';
import { safeFilename } from './download-adapter';
import { WebDownloadAdapter, webDownloadSupport } from './web-downloads';

/**
 * The browser side of downloading a movie. The streaming path is the one
 * that matters: it is what keeps a feature-length file out of memory and
 * makes the queue's progress bar and Cancel button mean something. jsdom
 * has neither `showSaveFilePicker` nor a real `fetch`, so both are stood up
 * here — which is fine, because what is under test is this module's
 * plumbing, not the browser's.
 */

interface Recorder {
    progress: DownloadProgress[];
    done: number;
    errors: DownloadFailure[];
}

function recorder(): { rec: Recorder; callbacks: Parameters<WebDownloadAdapter['start']>[2] } {
    const rec: Recorder = { progress: [], done: 0, errors: [] };
    return {
        rec,
        callbacks: {
            onProgress: (p) => rec.progress.push(p),
            onDone: () => {
                rec.done += 1;
            },
            onError: (reason) => rec.errors.push(reason),
        },
    };
}

/** A writable that records what was written, so a spec can assert the bytes actually landed somewhere. */
function fakeHandle(): { chunks: Uint8Array[]; closed: boolean; aborted: boolean; handle: unknown } {
    const state = { chunks: [] as Uint8Array[], closed: false, aborted: false, handle: null as unknown };
    state.handle = {
        createWritable: () =>
            Promise.resolve({
                write: (chunk: Uint8Array) => {
                    state.chunks.push(chunk);
                    return Promise.resolve();
                },
                close: () => {
                    state.closed = true;
                    return Promise.resolve();
                },
                abort: () => {
                    state.aborted = true;
                    return Promise.resolve();
                },
            }),
    };
    return state;
}

/** A body that yields `chunks` one at a time, pausing between them so a spec can cancel mid-stream. */
function bodyOf(chunks: Uint8Array[], gate?: () => Promise<void>): ReadableStream<Uint8Array> {
    let index = 0;
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            if (gate) await gate();
            if (index >= chunks.length) {
                controller.close();
                return;
            }
            controller.enqueue(chunks[index] as Uint8Array);
            index += 1;
        },
    });
}

async function settle(): Promise<void> {
    for (let i = 0; i < 40; i++) await Promise.resolve();
}

afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
});

describe('safeFilename', () => {
    it('strips path separators and other characters a filesystem will not take', () => {
        expect(safeFilename('Alien: Director\'s Cut / 4K', 'mkv')).toBe("Alien Director's Cut 4K.mkv");
    });

    it('falls back to a usable name when the title is entirely unusable', () => {
        expect(safeFilename('///', 'mp4')).toBe('download.mp4');
    });

    it('normalises the extension and never doubles the dot', () => {
        expect(safeFilename('Movie', '.MP4')).toBe('Movie.mp4');
    });
});

describe('web download support detection', () => {
    it("reports 'handoff' when the browser has no save picker", () => {
        expect(webDownloadSupport()).toBe('handoff');
    });

    it("reports 'managed' once a save picker exists", () => {
        vi.stubGlobal('showSaveFilePicker', () => Promise.resolve({}));
        expect(webDownloadSupport()).toBe('managed');
    });
});

describe('WebDownloadAdapter — streaming path', () => {
    it('streams the body to the chosen file and reports progress against Content-Length', async () => {
        const file = fakeHandle();
        vi.stubGlobal('showSaveFilePicker', () => Promise.resolve(file.handle));
        vi.stubGlobal('fetch', () =>
            Promise.resolve(
                new Response(bodyOf([new Uint8Array(400), new Uint8Array(600)]), {
                    status: 200,
                    headers: { 'content-length': '1000' },
                }),
            ),
        );

        const adapter = new WebDownloadAdapter();
        const target = await adapter.prepare('Movie.mkv');
        expect(target?.kind).toBe('managed');

        const { rec, callbacks } = recorder();
        adapter.start('http://proxy.test/movie.mkv', target!, callbacks);
        await settle();

        expect(rec.progress.map((p) => p.receivedBytes)).toEqual([400, 1000]);
        expect(rec.progress[0]?.totalBytes).toBe(1000);
        expect(rec.done).toBe(1);
        expect(rec.errors).toEqual([]);
        expect(file.chunks).toHaveLength(2);
        expect(file.closed).toBe(true);
    });

    it('reports an unknown total when the provider sends no Content-Length', async () => {
        const file = fakeHandle();
        vi.stubGlobal('showSaveFilePicker', () => Promise.resolve(file.handle));
        vi.stubGlobal('fetch', () => Promise.resolve(new Response(bodyOf([new Uint8Array(64)]), { status: 200 })));

        const adapter = new WebDownloadAdapter();
        const target = await adapter.prepare('Movie.mkv');
        const { rec, callbacks } = recorder();
        adapter.start('http://proxy.test/movie.mkv', target!, callbacks);
        await settle();

        expect(rec.progress[0]?.totalBytes).toBeNull();
        expect(rec.done).toBe(1);
    });

    it('cancel aborts the transfer, discards the partial file, and reports it exactly once', async () => {
        const file = fakeHandle();
        vi.stubGlobal('showSaveFilePicker', () => Promise.resolve(file.handle));
        let release: (() => void) | null = null;
        const gate = (): Promise<void> =>
            new Promise<void>((resolve) => {
                release = resolve;
            });
        vi.stubGlobal('fetch', (_url: string, init?: { signal?: AbortSignal }) => {
            const body = bodyOf([new Uint8Array(10), new Uint8Array(10)], gate);
            // A real fetch rejects its own promise on abort only before the
            // response resolves; here the abort lands mid-read, which is the
            // case the adapter's `aborted` check exists for.
            init?.signal?.addEventListener('abort', () => release?.());
            return Promise.resolve(new Response(body, { status: 200, headers: { 'content-length': '20' } }));
        });

        const adapter = new WebDownloadAdapter();
        const target = await adapter.prepare('Movie.mkv');
        const { rec, callbacks } = recorder();
        const handle = adapter.start('http://proxy.test/movie.mkv', target!, callbacks);

        await settle();
        handle.cancel();
        // A second cancel must not produce a second outcome.
        handle.cancel();
        await settle();

        expect(rec.errors).toEqual(['cancelled']);
        expect(rec.done).toBe(0);
        expect(file.aborted).toBe(true);
        expect(file.closed).toBe(false);
    });

    it("reports 'network' when the provider refuses the request", async () => {
        const file = fakeHandle();
        vi.stubGlobal('showSaveFilePicker', () => Promise.resolve(file.handle));
        vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 404 })));

        const adapter = new WebDownloadAdapter();
        const target = await adapter.prepare('Movie.mkv');
        const { rec, callbacks } = recorder();
        adapter.start('http://proxy.test/movie.mkv', target!, callbacks);
        await settle();

        expect(rec.errors).toEqual(['network']);
        expect(rec.done).toBe(0);
    });

    it('queues nothing when the viewer dismisses the picker', async () => {
        vi.stubGlobal('showSaveFilePicker', () => Promise.reject(new DOMException('cancelled', 'AbortError')));
        const adapter = new WebDownloadAdapter();
        expect(await adapter.prepare('Movie.mkv')).toBeNull();
    });
});

describe('WebDownloadAdapter — browser handoff', () => {
    it('hands the URL to the browser and reports done, since the page can neither watch nor stop it', async () => {
        const adapter = new WebDownloadAdapter();
        const target = await adapter.prepare('Movie.mkv');
        expect(target?.kind).toBe('handoff');

        // Spied rather than replaced by hand: the anchor is created,
        // clicked and removed inside `start()`, so this is the only moment
        // its href/download are observable.
        const clicked: { href: string; download: string }[] = [];
        const spy = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(function click(this: HTMLAnchorElement) {
                clicked.push({ href: this.href, download: this.download });
            });

        const { rec, callbacks } = recorder();
        adapter.start('http://proxy.test/movie.mkv', target!, callbacks);
        spy.mockRestore();

        expect(clicked).toEqual([{ href: 'http://proxy.test/movie.mkv', download: 'Movie.mkv' }]);
        expect(rec.done).toBe(1);
        // Nothing is left behind in the document.
        expect(document.querySelector('a[download]')).toBeNull();
    });
});
