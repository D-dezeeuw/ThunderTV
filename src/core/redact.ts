/**
 * The one place credentials are stripped from anything the app shows,
 * stores, or exports.
 *
 * This started as five separate implementations — `raw-capture.ts`,
 * `xtream/urls.ts`, `xtream/client.ts`, `m3u/import.ts` and
 * `state/config-export.ts` each grew their own, two of them under the same
 * name with different behaviour — so "is this URL safe to log?" had five
 * answers depending on which module you were in, and each new credential
 * shape had to be remembered five times. They now all delegate here.
 *
 * The layering is what makes that safe: `core/` imports no other layer, so
 * every module above it can reach this one without a cycle.
 *
 * Two functions, because there are genuinely two jobs. `redactUrl()` is for
 * a value that *is* a URL and can be parsed as one — it rewrites structure.
 * `redactText()` is for free text that may *contain* one (a log line, a
 * stringified object, a truncated fragment) and can never parse; it sweeps
 * with regexes and is deliberately eager, because the cost of over-redacting
 * a log line is a less useful log line, and the cost of under-redacting one
 * is a password on a screenshot.
 */

/**
 * Query parameters that carry a secret on the M3U and Xtream sides
 * (`?username=…&password=…`, `?token=…`). Compared lowercased.
 *
 * Shared with `health/stream-key.ts`, which masks the same parameters for a
 * different reason (a credential-free identity, not a display string) —
 * having one list means a new credential shape cannot be taught to one and
 * not the other.
 */
export const CREDENTIAL_PARAMS: ReadonlySet<string> = new Set([
    'username',
    'user',
    'password',
    'pass',
    'token',
    'auth',
    'key',
]);

/** Xtream's three stream shapes all place `{user}/{pass}` immediately after the kind segment. */
const CREDENTIAL_PATH_KINDS = 'live|movie|series';

/** What a redacted value reads as. One token everywhere, so it is greppable and obvious in a screenshot. */
const REDACTED = 'REDACTED';

/** Returned instead of the input when a URL cannot be parsed — better a useless field than a leaked one. */
const UNPARSEABLE = '[unparseable url redacted]';

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Strips everything credential-shaped from a URL: `user:pass@` userinfo, the
 * credential query parameters above, and the `/live/{user}/{pass}/` path
 * segments Xtream panels use — which no query-parameter scrub catches, and
 * which are the shape that actually leaks in practice.
 *
 * Schemeless input is treated as `http://` so a pasted `provider.example/x`
 * still gets scrubbed rather than falling to the placeholder.
 */
export function redactUrl(url: string): string {
    try {
        const parsed = new URL(HAS_SCHEME.test(url) ? url : `http://${url}`);
        parsed.username = '';
        parsed.password = '';
        for (const name of [...parsed.searchParams.keys()]) {
            if (CREDENTIAL_PARAMS.has(name.toLowerCase())) parsed.searchParams.set(name, REDACTED);
        }
        // Unanchored on purpose: a panel served under a subpath
        // (`/iptv/live/user/pass/1.ts`) leaks exactly as readily as one at
        // the root, and matching only the root would quietly miss it.
        parsed.pathname = parsed.pathname.replace(
            new RegExp(`/(${CREDENTIAL_PATH_KINDS})/[^/]+/[^/]+/`, 'i'),
            `/$1/${REDACTED}/${REDACTED}/`,
        );
        return parsed.toString();
    } catch {
        return UNPARSEABLE;
    }
}

const PARAM_NAMES = [...CREDENTIAL_PARAMS].join('|');

/**
 * Four sweeps over free text. Order matters only in that none of them can
 * re-match another's output — `REDACTED` contains no `@`, `=` or `/`.
 *
 * The userinfo pattern matches greedily up to the last `@` before a path
 * separator, so a password containing its own `@` (`bob:p@ss@host`) is
 * consumed whole rather than leaving a tail behind.
 */
const TEXT_SWEEPS: readonly (readonly [RegExp, string])[] = [
    [new RegExp(`([?&](?:${PARAM_NAMES})=)[^&\\s"'<>]*`, 'gi'), `$1${REDACTED}`],
    [new RegExp(`/(${CREDENTIAL_PATH_KINDS})/[^/\\s]+/[^/\\s]+/`, 'gi'), `/$1/${REDACTED}/${REDACTED}/`],
    [/([a-z][a-z0-9+.-]*:\/\/)[^/\s]*@/gi, `$1${REDACTED}@`],
    [new RegExp(`("(?:${PARAM_NAMES})"\\s*:\\s*")(?:\\\\.|[^"\\\\])*(")`, 'gi'), `$1${REDACTED}$2`],
];

/**
 * Redacts a string that may contain URLs or stringified objects anywhere
 * inside it. Never parses, never throws — this runs on the debug console's
 * ingress path, where the input is whatever anyone passed to `console.error`
 * and a throw would lose the very message being diagnosed.
 *
 * Safe on truncated input: none of the patterns need a closing delimiter, so
 * a value cut mid-secret still matches to the end of what survived.
 */
export function redactText(text: string): string {
    let out = text;
    for (const [pattern, replacement] of TEXT_SWEEPS) out = out.replace(pattern, replacement);
    return out;
}

/**
 * Xtream's `user_info` block echoes the account's username and password
 * back in plain text. Everything else in these payloads is channel data
 * worth reading verbatim, so this is deliberately narrower than
 * `redactText()`: only these two JSON fields, leaving the document
 * otherwise byte-identical to what the server sent.
 *
 * Do not widen it to `CREDENTIAL_PARAMS` — a captured body is a diagnostic
 * artefact whose value is being an exact copy, and `"key"` or `"auth"` are
 * ordinary field names in provider payloads that carry no secret.
 */
export function redactJsonCredentialFields(body: string): string {
    return body.replace(/("(?:username|password)"\s*:\s*")(?:\\.|[^"\\])*(")/gi, `$1${REDACTED}$2`);
}
