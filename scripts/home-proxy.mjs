#!/usr/bin/env node
/**
 * ThunderTV home proxy — the exact same logic as the Cloudflare Worker
 * (`cloudflare-cors-proxy.mjs`, one source of truth, wrapped by
 * `proxy-server.mjs`), but running on your own hardware and therefore your
 * own residential IP.
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
 * Same-machine test (deployed app in Chrome on this computer): set the
 * proxy template to `http://localhost:8899/{url}` — localhost is exempt
 * from mixed-content blocking, so no HTTPS tunnel is needed.
 *
 * For other devices (your phone), the deployed HTTPS app needs an https://
 * proxy URL. Easiest no-domain option is Tailscale Funnel:
 *   1. Install Tailscale on this box (free tier), `tailscale up`.
 *   2. `tailscale funnel 8899` → prints https://mybox.tail1234.ts.net
 *   3. Restart with PUBLIC_ORIGIN set to that URL (it is what rewritten
 *      HLS manifest URIs point back at):
 *      PUBLIC_ORIGIN=https://mybox.tail1234.ts.net node scripts/home-proxy.mjs
 *   4. ThunderTV → Settings → Streaming → https://mybox.tail1234.ts.net/{url}
 * Cloudflare Tunnel (`cloudflared`) works the same way.
 *
 * ALLOWED_HOSTS is strongly recommended when tunneled — the funnel URL is
 * public, and without an allowlist this is an open proxy.
 */
import { createProxyServer } from './proxy-server.mjs';

const options = {
    port: Number(process.env.PORT ?? 8899),
    allowedHosts: process.env.ALLOWED_HOSTS ?? '',
    ...(process.env.PUBLIC_ORIGIN ? { publicOrigin: process.env.PUBLIC_ORIGIN } : {}),
};

const { port, origin } = await createProxyServer(options);
console.log(`ThunderTV home proxy listening on http://0.0.0.0:${String(port)} (public origin: ${origin})`);
if (!options.allowedHosts) {
    console.log('WARNING: ALLOWED_HOSTS not set — this is an open proxy; set it to your provider host.');
}
