# docker/

The home proxy as a container, on an existing Nginx Proxy Manager network.

Why you'd run this: the deployed app is HTTPS and most providers are not, and
many panels refuse stream endpoints from datacenter IPs. A proxy on your own
connection fixes both — see the root `README.md`'s "Reaching your provider from
the deployed site" for which problem you actually have, because the fixes
differ and a 403/404 is *not* CORS.

This is `scripts/home-proxy.mjs`, unchanged, with NPM terminating TLS instead
of Tailscale Funnel.

## Setup

```bash
cd docker
cp .env.example .env      # fill in both values
docker compose up -d --build
```

Then in **Nginx Proxy Manager → Hosts → Proxy Hosts → Add**:

| Field | Value |
| --- | --- |
| Domain Names | `iptv-proxy.example.com` (must match `PUBLIC_ORIGIN`) |
| Scheme | `http` |
| Forward Hostname | `thundertv-proxy` |
| Forward Port | `8899` |
| Cache Assets | **off** — this would cache video segments |
| Block Common Exploits | **off** — see below |
| Websockets Support | off (not used) |
| SSL | request a Let's Encrypt cert, Force SSL on |

Finally, **ThunderTV → Settings → Streaming → proxy template**:
`https://iptv-proxy.example.com/{url}`

## The NPM settings that are not optional

Two defaults break this, both in ways that look like something else.

**Turn off "Block Common Exploits."** Targets reach the proxy percent-encoded
in the path (`/https%3A%2F%2Fprovider…`), and those rules false-positive on
encoded URLs. The result is a **403 from nginx that is indistinguishable from a
403 from your provider** — precisely the symptom you are probably here to
diagnose. Rule it out before blaming the panel.

**Add this under Advanced → Custom Nginx Configuration:**

```nginx
proxy_buffering off;
proxy_request_buffering off;
proxy_read_timeout 1h;
proxy_send_timeout 1h;
```

A live channel is an endless transport stream. nginx buffers proxied responses
by default, which adds startup latency and can stall playback outright, and the
default 60-second read timeout will eventually cut a stream that pauses.
`proxy-server.mjs` already streams chunk-by-chunk with client-abort
cancellation; this stops nginx undoing that.

## Both environment variables matter

`ALLOWED_HOSTS` — the provider host(s) this proxy may reach. Without it you
have an **open proxy on a public hostname**, and it will be found. NPM's Access
Lists are not an alternative here: the app requests the proxy URL from
JavaScript and cannot send basic-auth credentials, so the allowlist is the
access control.

`PUBLIC_ORIGIN` — the public HTTPS URL, no trailing slash. The proxy rewrites
HLS manifests so every variant, segment and key URI points back at itself, and
this is the origin it writes in. Get it wrong and the failure is confusing
rather than obvious: **the channel list loads, then every segment 404s.**

Compose refuses to start if either is unset, deliberately — both failures are
quiet.

## Verifying

```bash
docker compose logs -f thundertv-proxy
```

A healthy start logs the listening port and the public origin, and logs *no*
open-proxy warning. Then, from any browser:

```
https://iptv-proxy.example.com/https%3A%2F%2Fexample.com%2F
```

A response — any response — means NPM is reaching the container. `502` means it
is not (check the forward hostname and that both stacks share the network);
`403` with `host not allowed` means the proxy is up and `ALLOWED_HOSTS` is
doing its job.

In the app, work outward: source adds and channels list (API path) → logos
render (mixed content) → an HLS channel plays (manifest rewriting *and*
segments) → an MPEG-TS channel plays.

## Privacy

Xtream credentials travel in the proxied URL, so they appear in this
container's target URLs and in NPM's access logs. That is the same tradeoff
`scripts/cloudflare-cors-proxy.mjs` documents — running it yourself is what
keeps the operator you.
