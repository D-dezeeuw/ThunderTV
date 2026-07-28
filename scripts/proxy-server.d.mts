/**
 * Ambient declaration for `proxy-server.mjs` — a plain-JS Node script
 * (`allowJs` stays `false` project-wide, Feature 01.2) whose two runtime
 * consumers are themselves `.mjs` (`home-proxy.mjs`, `desktop/main.mjs`).
 * This exists so `proxy-server.spec.mts` can import it under `checkJs`-free
 * type checking, mirroring `gen-m3u-fixture.d.mts`.
 */
import type { Server } from 'node:http';

export interface ProxyServerOptions {
    host?: string;
    port?: number;
    /** An HTTPS tunnel URL that rewritten HLS manifest URIs point back at; defaults to the bound loopback address. */
    publicOrigin?: string;
    allowedHosts?: string;
}

export interface ProxyServerHandle {
    server: Server;
    port: number;
    origin: string;
}

export function createProxyServer(options?: ProxyServerOptions): Promise<ProxyServerHandle>;
