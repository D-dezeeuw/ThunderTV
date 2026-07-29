import { isHandoffSession, type HandoffSession } from './session';

/**
 * A handoff as something you can send — the transport half of stone 9.
 *
 * ## Why a link, and what that costs
 *
 * The vision asks for handoff "over the local network only". A static page
 * in a browser cannot do that half: it has no listening socket, no mDNS, no
 * way to be *found* by a peer. WebRTC needs a signalling server, which is
 * the exact thing the "static forever, 0 servers" invariant forbids. So a
 * true LAN transport needs a host that can listen — the Electron shell —
 * and `capabilities.lanHandoff` is the seam it will land behind. **It is not
 * built yet, and this file does not pretend otherwise.**
 *
 * What every host *can* do today is put the session in a URL fragment. That
 * is the `#/connect` bookmark idea (reserved since Phase 02) generalised: no
 * server, no account, nothing in flight that the user did not personally
 * hand over, and it works between a phone and a TV that cannot see each
 * other on any network at all.
 *
 * ## Why the fragment specifically
 *
 * Everything after `#` stays in the browser: it is never sent in an HTTP
 * request, never reaches a server, and never lands in a proxy log. For a
 * payload describing what someone is watching, that is not a detail — it is
 * the difference between a private handoff and a broadcast one. The receiving
 * side scrubs it from the address bar as soon as it is read
 * (`src/state/handoff.actions.ts`), the same consume-and-scrub discipline
 * the router's `connect` route was reserved with.
 */

export const HANDOFF_ROUTE = 'handoff';
export const HANDOFF_PARAM = 'h';

/** Base64url (RFC 4648 §5) — the `+` and `/` of plain base64 do not survive a URL intact. */
function base64UrlEncode(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(text: string): string {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

export function encodeHandoff(session: HandoffSession): string {
    return base64UrlEncode(JSON.stringify(session));
}

/**
 * Never throws. Anything that arrives in a URL is untrusted input — a
 * truncated link, a mangled paste, someone's idea of a joke — and the only
 * correct answer to all of it is the same `null`.
 */
export function decodeHandoff(encoded: string): HandoffSession | null {
    try {
        const parsed: unknown = JSON.parse(base64UrlDecode(encoded));
        return isHandoffSession(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * The full link to hand over. `base` is the receiving app's own address,
 * so a handoff works on a LAN-hosted copy, a `file://` Electron build, or a
 * page served from anywhere — the link is always to *this* app, wherever
 * this app happens to live.
 */
export function handoffUrl(session: HandoffSession, base: string): string {
    const withoutHash = base.split('#')[0] ?? '';
    return `${withoutHash}#/${HANDOFF_ROUTE}?${HANDOFF_PARAM}=${encodeHandoff(session)}`;
}

/** Reads a session out of a `#/handoff?h=…` hash, or `null` if this hash is not one. */
export function handoffFromHash(hash: string): HandoffSession | null {
    const withoutPrefix = hash.replace(/^#\/?/, '');
    const separator = withoutPrefix.indexOf('?');
    if (separator === -1) return null;
    if (withoutPrefix.slice(0, separator) !== HANDOFF_ROUTE) return null;
    const encoded = new URLSearchParams(withoutPrefix.slice(separator + 1)).get(HANDOFF_PARAM);
    return encoded ? decodeHandoff(encoded) : null;
}
