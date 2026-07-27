#!/usr/bin/env node
/**
 * ThunderTV home proxy — the exact same logic as the Cloudflare Worker
 * (`cloudflare-cors-proxy.mjs`, imported below, one source of truth), but
 * running on your own hardware and therefore your own residential IP.
 *
 * Why it exists: many IPTV panels serve their API to anything but block
 * stream endpoints for datacenter IPs (Cloudflare included) as
 * anti-restream protection — usually disguised as 404. Requests must come
 * from a residential connection, so the proxy has to live at home: a NAS,
 * Raspberry Pi, or any always-on machine with Node 20+.
 *
 * Run:
 *   PORT=8899 ALLOWED_HOSTS=provider.example:8080 node scripts/home-proxy.mjs
 *
 * The deployed app (HTTPS) can only call an https:// proxy, so expose this
 * over HTTPS. The easiest no-domain-needed option is Tailscale Funnel:
 *   1. Install Tailscale on the box (free tier is fine), `tailscale up`.
 *   2. `tailscale funnel 8899`
 *      → prints a stable public URL like https://mybox.tail1234.ts.net
 *   3. Set PUBLIC_ORIGIN to that URL and restart:
 *      PUBLIC_ORIGIN=https://mybox.tail1234.ts.net node scripts/home-proxy.mjs
 *      (PUBLIC_ORIGIN is what rewritten HLS manifest URIs point back at —
 *      without it they'd point at localhost and playback would break.)
 *   4. In ThunderTV: Settings → Streaming → proxy template =
 *      https://mybox.tail1234.ts.net/{url}
 * Cloudflare Tunnel (`cloudflared`) works the same way if you prefer it.
 *
 * ALLOWED_HOSTS is strongly recommended — the funnel URL is public, and
 * without an allowlist this is an open proxy for whoever finds it.
 */
import http from 'node:http';
import worker from './cloudflare-cors-proxy.mjs';

const PORT = Number(process.env.PORT ?? 8899);
const PUBLIC_ORIGIN = (process.env.PUBLIC_ORIGIN ?? `http://localhost:${String(PORT)}`).replace(/\/+$/, '');
const env = { ALLOWED_HOSTS: process.env.ALLOWED_HOSTS ?? '' };

http.createServer((req, res) => {
    const headers = new Headers();
    if (req.headers.range) headers.set('range', String(req.headers.range));
    const request = new Request(`${PUBLIC_ORIGIN}${req.url ?? '/'}`, { method: req.method ?? 'GET', headers });

    worker
        .fetch(request, env)
        .then(async (response) => {
            res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
            if (!response.body) {
                res.end();
                return;
            }
            // Stream, never buffer — a live TS feed is endless.
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
}).listen(PORT, '0.0.0.0', () => {
    console.log(`ThunderTV home proxy listening on http://0.0.0.0:${String(PORT)} (public origin: ${PUBLIC_ORIGIN})`);
    if (!env.ALLOWED_HOSTS) console.log('WARNING: ALLOWED_HOSTS not set — this is an open proxy; set it to your provider host.');
});
