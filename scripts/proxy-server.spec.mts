// @vitest-environment node
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The proxy streams an endless TS feed chunk by chunk, so its `.then()`
 * callback stays alive long after the response headers went out. The single
 * `.catch()` at the end of that chain therefore fires in two very different
 * situations, and used to treat both as "send a 502": once the stream is
 * already on the wire, `writeHead(502)` throws ERR_HTTP_HEADERS_SENT *inside
 * a promise catch*, which surfaces as an unhandled rejection and buries the
 * real failure. Starting a movie hit this every time — the player walks
 * mpegts → hls → native and drops each attempt's in-flight request.
 */
const fetchMock = vi.fn();
vi.mock('./cloudflare-cors-proxy.mjs', () => ({
    default: {
        fetch: (...args: unknown[]) => fetchMock(...args) as unknown,
    },
}));

const { createProxyServer } = await import('./proxy-server.mjs');

let running: import('node:http').Server | null = null;

async function start(): Promise<string> {
    const { server, port } = await createProxyServer({ host: '127.0.0.1', port: 0 });
    running = server;
    return `http://127.0.0.1:${String(port)}`;
}

/**
 * A plain `node:http` GET that resolves once the response is fully consumed
 * or the socket dies. A server-side `destroy()` mid-body reaches the client
 * as `aborted`, as a response `error`, or as an ECONNRESET on the request
 * depending on timing and Node version — all three mean the same thing here,
 * so they collapse into `aborted: true` rather than a rejection.
 */
function get(url: string): Promise<{ status: number; body: string; aborted: boolean }> {
    return new Promise((resolve, reject) => {
        let status = 0;
        let body = '';
        let settled = false;
        const finish = (aborted: boolean): void => {
            if (settled) return;
            settled = true;
            resolve({ status, body, aborted });
        };
        const req = http.get(url, (res) => {
            status = res.statusCode ?? 0;
            res.on('data', (c: Buffer) => (body += c.toString()));
            res.on('end', () => {
                finish(false);
            });
            res.on('aborted', () => {
                finish(true);
            });
            res.on('error', () => {
                finish(true);
            });
        });
        // No status yet means the request never got a response at all — that
        // is a genuine test failure, not the hang-up under test.
        req.on('error', (err) => {
            if (status) finish(true);
            else reject(err);
        });
    });
}

afterEach(() => {
    running?.close();
    running = null;
    fetchMock.mockReset();
});

describe('proxy-server error handling', () => {
    it('answers 502 when the worker fails before any response is sent', async () => {
        fetchMock.mockRejectedValue(new Error('upstream refused'));
        const origin = await start();

        const res = await get(`${origin}/whatever`);

        expect(res.status).toBe(502);
        expect(res.body).toContain('upstream refused');
    });

    it('hangs up instead of re-heading a response that is already streaming', async () => {
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        let opened = false;
        fetchMock.mockResolvedValue(
            new Response(
                new ReadableStream({
                    async pull(controller) {
                        if (!opened) {
                            opened = true;
                            controller.enqueue(new TextEncoder().encode('first chunk'));
                            return;
                        }
                        // The pause matters: it lets that chunk actually reach
                        // the client, so this reproduces a stream dying *after*
                        // headers went out rather than one that never started.
                        await new Promise((resolve) => setTimeout(resolve, 30));
                        controller.error(new Error('upstream reset'));
                    },
                }),
                { status: 200 },
            ),
        );
        const origin = await start();

        const res = await get(`${origin}/movie.mkv`);
        // Let any stray rejection reach the process handler before asserting.
        await new Promise((resolve) => setTimeout(resolve, 50));
        process.off('unhandledRejection', unhandled);

        expect(res.status).toBe(200);
        expect(res.body).toContain('first chunk');
        expect(res.aborted).toBe(true);
        expect(unhandled).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith('[thundertv-proxy] stream ended early:', expect.stringContaining('upstream reset'));
        warn.mockRestore();
    });
});
