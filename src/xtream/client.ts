import { getPlatform } from '../core/platform';
import { captureRawResponse } from '../core/raw-capture';
import { asArray, asBool01, asNumber, asString } from './coerce';
import { classifyXtreamHttpFailure, looksLikeHtmlLoginPage, type XtreamError } from './errors';
import type { AccountStatus, XtreamCategory, XtreamLiveStream, XtreamSource } from './types';
import { apiUrl } from './urls';

type XtreamResult<T> = { ok: true; data: T } | { ok: false; error: XtreamError };

/** The API URL with credentials stripped — `apiUrl()` embeds username and password as query parameters. */
function redactApiUrl(source: XtreamSource, action: string): string {
    return apiUrl({ ...source, user: 'REDACTED', pass: 'REDACTED' }, action, '');
}

async function callApi(source: XtreamSource, action: string, extra = ''): Promise<XtreamResult<unknown>> {
    const res = await getPlatform().http.get(apiUrl(source, action, extra));
    if (res.kind !== 'ok') return { ok: false, error: classifyXtreamHttpFailure(action, res) };

    const text = await res.res.text();
    // Captured before any parsing, and before the login-page and JSON checks
    // below can reject it — a response the app refuses is exactly the one
    // worth reading raw.
    captureRawResponse({
        label: `xtream:${action || 'authenticate'}`,
        url: redactApiUrl(source, action),
        contentType: 'application/json',
        status: 200,
        body: text,
    });

    if (looksLikeHtmlLoginPage(text)) return { ok: false, error: { kind: 'auth-failed', action } };

    try {
        return { ok: true, data: JSON.parse(text) as unknown };
    } catch {
        return { ok: false, error: { kind: 'bad-payload', action } };
    }
}

/** The no-action `player_api.php` handshake (Feature 19.3.1). */
export async function authenticate(source: XtreamSource): Promise<XtreamResult<AccountStatus>> {
    const result = await callApi(source, '');
    if (!result.ok) return result;

    const body = result.data as { user_info?: Record<string, unknown> };
    const info = body.user_info ?? {};
    const authenticated = asBool01(info['auth']);
    const status = asString(info['status']) ?? (authenticated ? 'Active' : 'Unknown');

    if (!authenticated || status === 'Banned' || status === 'Disabled') {
        return { ok: false, error: { kind: 'auth-failed', action: 'authenticate' } };
    }

    const expRaw = asNumber(info['exp_date']);
    const allowedOutputFormats = asArray<unknown>(info['allowed_output_formats'])
        .map((f) => asString(f))
        .filter((f): f is string => f !== undefined);
    return {
        ok: true,
        data: { authenticated, status, expiresAt: expRaw ? expRaw * 1000 : null, allowedOutputFormats },
    };
}

export async function getLiveCategories(source: XtreamSource): Promise<XtreamResult<XtreamCategory[]>> {
    const result = await callApi(source, 'get_live_categories');
    if (!result.ok) return result;

    const rows = asArray<Record<string, unknown>>(result.data);
    const categories = rows
        .map((row) => normalizeCategory(row))
        .filter((c): c is XtreamCategory => c !== undefined);
    return { ok: true, data: categories };
}

function normalizeCategory(row: Record<string, unknown>): XtreamCategory | undefined {
    const id = asString(row['category_id']);
    const name = asString(row['category_name']);
    if (id === undefined || name === undefined) return undefined;
    return { id, name };
}

/** Quirk (Feature 19.2.7): omitting `category_id` returns the entire live catalog in one call — used here to avoid an N-category request storm for the MVP slice. */
export async function getLiveStreams(source: XtreamSource): Promise<XtreamResult<XtreamLiveStream[]>> {
    const result = await callApi(source, 'get_live_streams');
    if (!result.ok) return result;

    const rows = asArray<Record<string, unknown>>(result.data);
    const streams = rows
        .map((row) => normalizeStream(row))
        .filter((s): s is XtreamLiveStream => s !== undefined);
    return { ok: true, data: streams };
}

function normalizeStream(row: Record<string, unknown>): XtreamLiveStream | undefined {
    const streamId = asNumber(row['stream_id']);
    const name = asString(row['name']);
    const categoryId = asString(row['category_id']);
    if (streamId === undefined || name === undefined || categoryId === undefined) return undefined;
    const icon = asString(row['stream_icon']);
    const epgChannelId = asString(row['epg_channel_id']);
    return {
        streamId,
        name,
        categoryId,
        ...(icon !== undefined ? { icon } : {}),
        ...(epgChannelId !== undefined ? { epgChannelId } : {}),
    };
}
