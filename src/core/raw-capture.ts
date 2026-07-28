/**
 * Session buffer of untouched provider responses.
 *
 * The configuration export shows what the app *made* of the provider's
 * data; this shows what the provider actually sent, before any parsing,
 * normalization or filtering. When the two disagree the bug is ours, and
 * without the raw side there is no way to tell that from a provider that
 * simply doesn't carry a channel.
 *
 * Deliberately module memory, never storage: these payloads are large, and
 * persisting a provider's full catalogue (credentials included) across
 * sessions is not a trade worth making for a diagnostic. A reload clears
 * them — re-import or refresh the source to repopulate.
 */

export interface RawCapture {
    /** What produced it: `xtream:get_live_streams`, `m3u:url`, `m3u:paste`. */
    label: string;
    /** Request URL, already credential-redacted by the caller where one exists. */
    url: string;
    contentType: string;
    /** HTTP status, or 0 for a non-HTTP source such as pasted text. */
    status: number;
    /** Byte-ish length of the untruncated body, so a truncated capture still reports the real size. */
    length: number;
    body: string;
    truncated: boolean;
}

/** Per-response ceiling. Big enough for a full `get_live_streams` payload, small enough that a runaway response cannot exhaust memory. */
const MAX_BODY_CHARS = 4_000_000;
/** Total across all captures. Past this, the oldest are dropped. */
const MAX_TOTAL_CHARS = 12_000_000;
/** Hard entry count, so many small responses cannot grow the buffer unbounded either. */
const MAX_ENTRIES = 24;

let captures: RawCapture[] = [];

/**
 * Xtream's `user_info` block echoes the account's username and password
 * back in plain text. Everything else in these payloads is channel data
 * worth reading verbatim, so the redaction is deliberately narrow: only
 * these two JSON fields, leaving the document otherwise byte-identical to
 * what the server sent.
 */
function redactCredentialFields(body: string): string {
    return body.replace(
        /("(?:username|password)"\s*:\s*")(?:\\.|[^"\\])*(")/gi,
        '$1REDACTED$2',
    );
}

export function captureRawResponse(entry: Omit<RawCapture, 'length' | 'truncated'>): void {
    const redacted = redactCredentialFields(entry.body);
    const truncated = redacted.length > MAX_BODY_CHARS;

    captures.push({
        ...entry,
        body: truncated ? redacted.slice(0, MAX_BODY_CHARS) : redacted,
        length: entry.body.length,
        truncated,
    });

    // Newest wins: a fresh refresh is what the user just did, and the stale
    // capture it replaces is the less interesting one.
    while (captures.length > MAX_ENTRIES) captures.shift();
    let total = captures.reduce((sum, c) => sum + c.body.length, 0);
    while (captures.length > 1 && total > MAX_TOTAL_CHARS) {
        const dropped = captures.shift();
        total -= dropped?.body.length ?? 0;
    }
}

export function rawCaptures(): readonly RawCapture[] {
    return captures;
}

export function clearRawCaptures(): void {
    captures = [];
}
