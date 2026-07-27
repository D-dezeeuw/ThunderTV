/**
 * Shared Node runner for the ThunderTV proxy: wraps the unchanged
 * Cloudflare Worker module (`cloudflare-cors-proxy.mjs`, one source of
 * truth) in a `node:http` server. Two consumers:
 *   - `scripts/home-proxy.mjs` — standalone CLI for a NAS/Pi/always-on PC;
 *   - `desktop/main.mjs`       — the Electron app embeds it on 127.0.0.1,
 *     so the desktop app needs zero proxy setup and every provider request
 *     leaves from the machine's own (residential) IP.
 *
 * Streams are written chunk-by-chunk with client-abort cancellation — a
 * live TS feed is endless and must never be buffered.
 */
import http from 'node:http';
import worker from './cloudflare-cors-proxy.mjs';

/**
 * @param {{ host?: string, port?: number, publicOrigin?: string, allowedHosts?: string }} options
 * @returns {Promise<{ server: import('node:http').Server, port: number, origin: string }>}
 *   `origin` is what rewritten HLS manifest URIs point back at — the
 *   explicit `publicOrigin` (an HTTPS tunnel URL) when given, otherwise the
 *   actually-bound loopback address (which is correct for the embedded
 *   desktop case).
 */
export function createProxyServer({ host = '0.0.0.0', port = 8899, publicOrigin, allowedHosts = '' } = {}) {
    const env = { ALLOWED_HOSTS: allowedHosts };
    let origin = publicOrigin ? publicOrigin.replace(/\/+$/, '') : '';

    const server = http.createServer((req, res) => {
        const headers = new Headers();
        if (req.headers.range) headers.set('range', String(req.headers.range));
        const request = new Request(`${origin}${req.url ?? '/'}`, { method: req.method ?? 'GET', headers });

        worker
            .fetch(request, env)
            .then(async (response) => {
                res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
                if (!response.body) {
                    res.end();
                    return;
                }
                const reader = response.body.getReader();
                res.on('close', () => {
                    void reader.cancel().catch(() => undefined);
                });
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (!res.write(value)) await new Promise((resolve) => res.once('drain', resolve));
                }
                res.end();
            })
            .catch((err) => {
                res.writeHead(502);
                res.end(String(err));
            });
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            const address = server.address();
            const boundPort = typeof address === 'object' && address ? address.port : port;
            if (!origin) {
                const originHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
                origin = `http://${originHost}:${String(boundPort)}`;
            }
            resolve({ server, port: boundPort, origin });
        });
    });
}
