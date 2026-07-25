/**
 * The optional user-configured proxy (masterplan §8, item 3): a URL
 * template like `https://my-proxy/{url}` applied to playlist, EPG, and
 * Xtream API calls. Empty by default — ThunderTV ships no public proxy and
 * makes no availability/privacy promises about a user-supplied one.
 *
 * IMPORTANT: a configured proxy sees every URL routed through it, including
 * Xtream URLs that embed the user's provider credentials in the path. This
 * exact warning ships in Settings → Streaming copy (`strings.http.proxy.credentialWarning`,
 * consumed once Phase 22 builds that section).
 *
 * Caveat (Feature 03.6.8): hls.js/mpegts.js fetch video *segments* directly
 * — those requests bypass this adapter entirely and remain CORS-bound on
 * the web regardless of a configured proxy. Expectation-setting for that
 * belongs to the player phases (masterplan §8.3), not here.
 */

/** `{url}` substitution only accepts `https://`, or `http://localhost`/`http://127.0.0.1` for local development — never silently downgrades to no proxy. */
export function isValidProxyTemplate(template: string): boolean {
    const probe = template.includes('{url}') ? template.replace('{url}', 'x') : template + 'x';
    let url: URL;
    try {
        url = new URL(probe);
    } catch {
        return false;
    }
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
}

/**
 * Substitutes the **encodeURIComponent**-ed target into `{url}`; a template
 * without that placeholder gets the encoded URL appended instead (documented
 * behavior — Feature 03.6.1). Same-origin requests (app shell assets,
 * vendored files) are never proxied, and an empty/undefined template is a
 * no-op — both return `url` unchanged.
 */
export function applyProxy(template: string | undefined, url: string): string {
    if (!template) return url;
    if (isSameOrigin(url)) return url;

    const encoded = encodeURIComponent(url);
    return template.includes('{url}') ? template.replace('{url}', encoded) : template + encoded;
}

function isSameOrigin(url: string): boolean {
    try {
        return new URL(url, location.href).origin === location.origin;
    } catch {
        return false;
    }
}
