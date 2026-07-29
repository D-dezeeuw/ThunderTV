/**
 * A stable, **credential-free** identity for one stream.
 *
 * Health is a property of a *feed*, not of a channel: two variants of NPO 1
 * (the HD one and the bundle's backup) succeed and fail independently, and
 * picking the healthier of the two is the whole point of stone 3. So the
 * key has to come off the URL — but a raw Xtream URL embeds the account's
 * username and password directly in its path
 * (`{base}/live/{user}/{pass}/{id}.ts`, masterplan §6.8), and this data is
 * both persisted and, later, exportable in a Codex (stone 4). Storing raw
 * URLs would put credentials in a file the user is encouraged to share.
 *
 * Masking the credential segments solves both problems at once: the key
 * carries no secret, *and* it survives a password rotation — the same feed
 * keeps its accumulated history instead of silently starting from zero the
 * day the provider resets the account.
 */

/** Xtream's three stream shapes all place `{user}/{pass}` immediately after the kind segment. */
const CREDENTIAL_PATH_KINDS = new Set(['live', 'movie', 'series']);

/** Query parameters that carry a secret on the M3U side (`?username=…&password=…`, `?token=…`). Compared case-insensitively. */
const CREDENTIAL_PARAMS = new Set(['username', 'user', 'password', 'pass', 'token', 'auth', 'key']);

const MASK = '*';

/**
 * Returns a normalized `host/path` fingerprint with every credential-shaped
 * segment and query parameter masked, or `null` for a URL that cannot be
 * parsed (a malformed provider row — the caller then simply keeps no
 * health for it, rather than bucketing every unparseable row together).
 *
 * Deliberately keeps the port and drops the scheme: the same feed offered
 * over http and https is one feed, and a provider that flips scheme
 * shouldn't reset its history — but a different port genuinely is a
 * different endpoint on these panels.
 */
export function streamKey(rawUrl: string): string | null {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
    const kindIndex = segments.findIndex((segment) => CREDENTIAL_PATH_KINDS.has(segment.toLowerCase()));
    if (kindIndex !== -1) {
        // Mask exactly the two segments after the kind — never a blanket
        // "mask everything", which would collapse every stream on a panel
        // into one key and make the whole table useless.
        for (const offset of [1, 2]) {
            const at = kindIndex + offset;
            if (at < segments.length - 1) segments[at] = MASK;
        }
    }

    const query = maskedQuery(url);
    return `${url.host}/${segments.join('/')}${query}`;
}

function maskedQuery(url: URL): string {
    if (!url.search) return '';
    const params = new URLSearchParams(url.search);
    let touched = false;
    for (const name of [...params.keys()]) {
        if (!CREDENTIAL_PARAMS.has(name.toLowerCase())) continue;
        params.set(name, MASK);
        touched = true;
    }
    // Sorted so two URLs differing only in parameter order share a key.
    params.sort();
    const serialized = params.toString();
    return serialized.length > 0 ? `?${serialized}` : touched ? '?' : '';
}
