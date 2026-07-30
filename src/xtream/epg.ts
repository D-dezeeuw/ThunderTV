import { getPlatform } from '../core/platform';
import { captureRawResponse } from '../core/raw-capture';
import { asArray, asNumber, asString } from './coerce';
import { classifyXtreamHttpFailure, looksLikeHtmlLoginPage, type XtreamError } from './errors';
import type { XtreamSource } from './types';
import { apiUrl, redactUrl } from './urls';

/**
 * The provider's own guide — the EPG source this app should have been using
 * all along.
 *
 * The previous pipeline fetched a national XMLTV catalog from a third party
 * and then spent its effort *guessing* which of the subscription's channels
 * each catalog entry described, by normalized name and curated alias
 * (`src/epg/match.ts`). On the demo playlist that resolved 139 of 15,243
 * grouped channels. An Xtream panel already knows the answer: every live
 * stream it returns carries an `epg_channel_id`, which `client.ts` stores on
 * the row as `tvgId`, and the panel's own guide is keyed by exactly that. So
 * this path has no catalog, no matcher and no country registry — the join is
 * an equality check on an id both sides already agree on.
 *
 * Two endpoints, for two different jobs:
 *
 * - **`xmltv.php`** returns the whole subscription's guide as XMLTV. One
 *   request fills the Guide grid, and the payload is the same format
 *   `src/epg/xmltv.ts` already parses — so nothing downstream changes.
 * - **`get_short_epg`** returns a handful of upcoming programmes for one
 *   stream. That is what makes "open a channel that has no guide data and
 *   get its now/next immediately" cheap, instead of re-downloading
 *   everything.
 *
 * Note `xmltv.php` is NOT a `player_api.php` action — it is its own endpoint
 * with the credentials as query parameters, which is why it does not go
 * through `client.ts`'s `callApi()`.
 */

export type XtreamEpgResult<T> = { ok: true; data: T } | { ok: false; error: XtreamError };

/** One programme from `get_short_epg`, already decoded and converted to epoch ms. */
export interface XtreamEpgEntry {
    /** The panel's `epg_id`/channel id — equal to the stream's `epg_channel_id`, which is the row's `tvgId`. */
    channelId: string;
    start: number;
    stop: number;
    title: string;
    description: string | null;
}

/** The full-guide endpoint. Credentials are query parameters here, not path segments. */
export function xmltvUrl(source: XtreamSource): string {
    return `${source.url}/xmltv.php?username=${encodeURIComponent(source.user)}&password=${encodeURIComponent(source.pass)}`;
}

/**
 * Panels return `title`/`description` base64-encoded — undocumented, and
 * inconsistently applied: some encode, some do not, and some return an empty
 * string. Decoding is therefore best-effort and always falls back to the raw
 * value rather than losing a title to a decode error.
 *
 * `atob` yields Latin-1 bytes, so a UTF-8 title ("Journaal — Tweede
 * Kamerdebat") would mojibake without the re-decode below.
 */
const BASE64_ONLY = /^[A-Za-z0-9+/]+={0,2}$/;
/** A decode that lands on control bytes was never base64 in the first place. Written as a code-point scan rather than a regex literal: the class needs raw control characters, which both `no-control-regex` and `no-irregular-whitespace` reject on sight. Tab/newline/carriage-return stay allowed — a description legitimately contains them. */
function hasControlChars(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code === 9 || code === 10 || code === 13) continue;
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

export function decodeMaybeBase64(value: string): string {
    if (!value) return '';
    // `atob` alone is not a base64 *test*: it strips whitespace and accepts a
    // ragged final chunk, so a plain title like "NOS Journaal" decodes
    // happily into mojibake instead of throwing. Three gates instead —
    // strict charset, exact length, and a decode that yields valid UTF-8 with
    // no control bytes. A short plain word can still be coincidentally valid
    // base64; requiring the *result* to be sane is what makes that rare
    // rather than routine.
    if (value.length % 4 !== 0 || !BASE64_ONLY.test(value)) return value;
    try {
        const binary = atob(value);
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return hasControlChars(decoded) ? value : decoded;
    } catch {
        return value;
    }
}

/**
 * `get_short_epg` timestamps come as `start`/`end` (seconds since epoch, as
 * strings) *and* as `start_timestamp`/`stop_timestamp`, depending on panel
 * version — and some panels send `"2026-07-30 20:00:00"` in the first pair
 * instead. Every form is tried, in order of reliability, so one panel's
 * quirk cannot silently produce `NaN` programme bounds.
 */
export function epochMsFrom(row: Record<string, unknown>, ...keys: string[]): number | null {
    for (const key of keys) {
        const numeric = asNumber(row[key]);
        if (numeric !== undefined && numeric > 0) return numeric * 1000;
        const text = asString(row[key]);
        if (text) {
            // "YYYY-MM-DD HH:mm:ss" — panels emit this in the account's own
            // timezone with no offset. Treated as UTC rather than local: the
            // app's storage layer is UTC throughout, and guessing the
            // panel's zone would be worse than being consistently wrong by a
            // known amount. The numeric forms above are preferred precisely
            // because they carry no such ambiguity.
            const parsed = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
            if (!Number.isNaN(parsed)) return parsed;
        }
    }
    return null;
}

/** Normalizes one `epg_listings` row. Returns `null` for a row missing anything the guide needs, rather than storing a half-record. */
export function coerceEpgEntry(raw: unknown, fallbackChannelId: string): XtreamEpgEntry | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const row = raw as Record<string, unknown>;

    const start = epochMsFrom(row, 'start_timestamp', 'start');
    const stop = epochMsFrom(row, 'stop_timestamp', 'end', 'stop');
    if (start === null || stop === null || stop <= start) return null;

    const title = decodeMaybeBase64(asString(row['title']) ?? '').trim();
    if (!title) return null;

    const description = decodeMaybeBase64(asString(row['description']) ?? '').trim();
    const channelId = asString(row['epg_id']) ?? asString(row['channel_id']) ?? fallbackChannelId;
    if (!channelId) return null;

    return { channelId, start, stop, title, description: description || null };
}

/**
 * One channel's upcoming programmes. `limit` is the panel's own cap on how
 * many entries to return — small on purpose, since this exists to fill a
 * now/next line the moment a channel is opened, not to build a grid.
 *
 * `epgChannelId` is the row's `tvgId`; it is only used as the fallback key
 * for panels that omit `epg_id` from the listing rows themselves.
 */
export async function getShortEpg(
    source: XtreamSource,
    streamId: number,
    epgChannelId: string,
    limit = 12,
): Promise<XtreamEpgResult<XtreamEpgEntry[]>> {
    const action = 'get_short_epg';
    const extra = `&stream_id=${String(streamId)}&limit=${String(limit)}`;
    const res = await getPlatform().http.get(apiUrl(source, action, extra));
    if (res.kind !== 'ok') return { ok: false, error: classifyXtreamHttpFailure(action, res) };

    const text = await res.res.text();
    captureRawResponse({
        label: `xtream:${action}`,
        url: redactUrl(apiUrl(source, action, extra)),
        contentType: 'application/json',
        status: 200,
        body: text,
    });

    if (looksLikeHtmlLoginPage(text)) return { ok: false, error: { kind: 'auth-failed', action } };

    let parsed: unknown;
    try {
        parsed = JSON.parse(text) as unknown;
    } catch {
        return { ok: false, error: { kind: 'bad-payload', action } };
    }

    // `epg_listings` is the documented shape; a bare array is what a few
    // panels actually send. An empty result is a legitimate answer — plenty
    // of panels carry no guide for a given channel — so it is `ok` with no
    // entries, never an error.
    const container = parsed as { epg_listings?: unknown };
    const rows = asArray<unknown>(container.epg_listings ?? parsed);
    const entries = rows
        .map((row) => coerceEpgEntry(row, epgChannelId))
        .filter((entry): entry is XtreamEpgEntry => entry !== null);

    return { ok: true, data: entries };
}

/**
 * The whole subscription's guide, as raw XMLTV text for `src/epg/xmltv.ts`
 * to parse. Returned undecoded on purpose: one parse, one consumer, and the
 * existing parser already handles this exact format.
 *
 * A generous timeout — this is a single large document for every channel on
 * the account, and a panel serving it is often slower than its JSON
 * endpoints.
 */
export async function getXmltvGuide(source: XtreamSource): Promise<XtreamEpgResult<string>> {
    const action = 'xmltv';
    const url = xmltvUrl(source);
    const res = await getPlatform().http.get(url, { timeoutMs: 60_000 });
    if (res.kind !== 'ok') return { ok: false, error: classifyXtreamHttpFailure(action, res) };

    const text = await res.res.text();
    // Deliberately NOT `looksLikeHtmlLoginPage()`. That helper is "the body
    // starts with `<`", which is exactly right for the JSON endpoints and
    // exactly wrong here — a valid XMLTV guide opens with `<?xml`. So the
    // real document is identified positively (`<tv`), and only a body that
    // is neither that nor recognizable HTML falls through as bad-payload.
    if (/<tv[\s>]/i.test(text)) {
        // Not captured through `captureRawResponse` like the JSON endpoints:
        // this body is megabytes of XML, and the raw-capture buffer is an
        // in-memory diagnostic aid, not a place to park a full guide.
        return { ok: true, data: text };
    }
    if (/<!doctype html|<html[\s>]/i.test(text)) return { ok: false, error: { kind: 'auth-failed', action } };
    return { ok: false, error: { kind: 'bad-payload', action } };
}
