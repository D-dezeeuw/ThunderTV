import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK, type WorkerOut } from './worker-protocol';

/**
 * `parser.worker.ts` is a real module-worker entry (`self.onmessage`/
 * `self.onerror` assigned as a side effect at import time) — jsdom (this
 * suite's test environment) does not execute real Web Workers, so instead
 * of `new Worker(...)`, this spec stubs the global `postMessage` before
 * importing the module, then drives it exactly like a real `postMessage`
 * call from the client would (Feature 06.3.8/06.3.9's "a thin harness
 * around the exported handler function" — here, around the real
 * `self.onmessage` the module installs, since nothing is exported).
 */
async function loadWorker(): Promise<{ messages: WorkerOut[]; dispatch: (data: unknown) => void }> {
    vi.resetModules();
    const messages: WorkerOut[] = [];
    vi.stubGlobal('postMessage', (message: WorkerOut) => messages.push(message));

    await import('./parser.worker');

    return {
        messages,
        dispatch: (data: unknown) => {
            const handler = self.onmessage;
            if (!handler) throw new Error('parser.worker did not install self.onmessage');
            handler.call(self, new MessageEvent('message', { data }));
        },
    };
}

describe('parser.worker', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('answers progress -> chunk -> summary for a well-formed playlist', async () => {
        const { messages, dispatch } = await loadWorker();
        dispatch({
            type: 'parse',
            text: '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n',
            sourceId: 's1',
        });

        expect(messages.map((m) => m.type)).toEqual(['progress', 'chunk', 'summary']);
        const [progress, chunk, summary] = messages;
        expect(progress).toMatchObject({ type: 'progress', parsed: 1 });
        expect(chunk).toMatchObject({ type: 'chunk', done: true });
        if (chunk?.type === 'chunk') expect(chunk.rows).toHaveLength(1);
        expect(summary).toMatchObject({
            type: 'summary',
            total: 1,
            skipped: 0,
            radioCount: 0,
            drmCount: 0,
        });
    });

    it('answers a well-formed chunk/progress/summary sequence for an empty playlist', async () => {
        const { messages, dispatch } = await loadWorker();
        dispatch({ type: 'parse', text: '#EXTM3U\n', sourceId: 's1' });

        expect(messages.map((m) => m.type)).toEqual(['progress', 'chunk', 'summary']);
        const chunk = messages[1];
        if (chunk?.type === 'chunk') {
            expect(chunk.rows).toEqual([]);
            expect(chunk.done).toBe(true);
        }
        expect(messages[2]).toMatchObject({ type: 'summary', total: 0, groups: [] });
    });

    it('answers a single { type: "error" } message for a header-less playlist, and never throws', async () => {
        const { messages, dispatch } = await loadWorker();
        expect(() =>
            dispatch({ type: 'parse', text: 'garbage, not a playlist', sourceId: 's1' }),
        ).not.toThrow();

        expect(messages).toHaveLength(1);
        expect(messages[0]?.type).toBe('error');
    });

    it('emits one progress/chunk pair per CHUNK input items, with progress cadence proportional to chunk size', async () => {
        const lines = ['#EXTM3U'];
        const rowCount = CHUNK + 10;
        for (let i = 0; i < rowCount; i += 1) {
            lines.push(`#EXTINF:-1,Channel ${String(i)}`, `https://example.com/${String(i)}.m3u8`);
        }
        const { messages, dispatch } = await loadWorker();
        dispatch({ type: 'parse', text: lines.join('\n'), sourceId: 's1' });

        const progressMessages = messages.filter(
            (m): m is Extract<WorkerOut, { type: 'progress' }> => m.type === 'progress',
        );
        expect(progressMessages).toHaveLength(2);
        expect(progressMessages[0]?.parsed).toBe(CHUNK);
        expect(progressMessages[1]?.parsed).toBe(rowCount);

        const chunkMessages = messages.filter(
            (m): m is Extract<WorkerOut, { type: 'chunk' }> => m.type === 'chunk',
        );
        expect(chunkMessages).toHaveLength(2);
        expect(chunkMessages[0]?.rows).toHaveLength(CHUNK);
        expect(chunkMessages[0]?.done).toBe(false);
        expect(chunkMessages[1]?.rows).toHaveLength(10);
        expect(chunkMessages[1]?.done).toBe(true);

        const summary = messages.find((m) => m.type === 'summary');
        expect(summary).toMatchObject({ total: rowCount });
    });

    it('stays usable for a second parse after answering a prior one', async () => {
        const { messages, dispatch } = await loadWorker();
        dispatch({
            type: 'parse',
            text: '#EXTM3U\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n',
            sourceId: 's1',
        });
        const firstCount = messages.length;

        dispatch({
            type: 'parse',
            text: '#EXTM3U\n#EXTINF:-1,Two\nhttps://example.com/2.m3u8\n',
            sourceId: 's2',
        });
        expect(messages.length).toBeGreaterThan(firstCount);
        expect(messages[messages.length - 1]).toMatchObject({ type: 'summary', total: 1 });
    });
});
