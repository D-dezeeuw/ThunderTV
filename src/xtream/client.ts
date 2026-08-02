import { getPlatform } from '../core/platform';
import { captureRawResponse } from '../core/raw-capture';
import { asArray, asBool01, asNumber, asString } from './coerce';
import { classifyXtreamHttpFailure, looksLikeHtmlLoginPage, type XtreamError } from './errors';
import { coerceSeriesInfo } from './series-coerce';
import type {
    AccountStatus,
    XtreamCategory,
    XtreamLiveStream,
    XtreamSeries,
    XtreamSeriesInfo,
    XtreamSource,
    XtreamVodInfo,
    XtreamVodStream,
} from './types';
import { apiUrl, redactUrl } from './urls';

export type XtreamResult<T> = { ok: true; data: T } | { ok: false; error: XtreamError };

/** The API URL with credentials stripped — `apiUrl()` embeds username and password as query parameters. Exported for direct hostile-fixture testing (client.spec.ts), same rationale as `xtream/urls.ts`'s own `redactUrl`. */
export function redactApiUrl(source: XtreamSource, action: string): string {
    return redactUrl(apiUrl(source, action, ''));
}

/**
 * `signal` is opt-in and, when passed, is the one way a call here can
 * *throw* rather than resolve a classified failure: `classifiedFetch()`
 * deliberately re-throws a caller-initiated `AbortError` (the caller already
 * knows it aborted). Only the "search all" sweep (`state/catalog-sweep.ts`)
 * passes one — it needs a multi-megabyte catalog dump to stop the moment the
 * user presses Cancel, not when the download finally finishes — and it
 * catches the rejection itself. Every other call site omits it and is
 * unaffected.
 */
async function callApi(source: XtreamSource, action: string, extra = '', signal?: AbortSignal): Promise<XtreamResult<unknown>> {
    const res = await getPlatform().http.get(apiUrl(source, action, extra), signal ? { signal } : undefined);
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

/** Bucket for rows whose `category_id` is null, missing, or unparseable (Feature 21.1.7) — unlike live streams, a VOD/series row is never dropped for a missing category. */
const UNCATEGORIZED = 'uncategorized';

export async function getVodCategories(source: XtreamSource, signal?: AbortSignal): Promise<XtreamResult<XtreamCategory[]>> {
    return getCategoriesByAction(source, 'get_vod_categories', signal);
}

export async function getSeriesCategories(source: XtreamSource, signal?: AbortSignal): Promise<XtreamResult<XtreamCategory[]>> {
    return getCategoriesByAction(source, 'get_series_categories', signal);
}

async function getCategoriesByAction(source: XtreamSource, action: string, signal?: AbortSignal): Promise<XtreamResult<XtreamCategory[]>> {
    const result = await callApi(source, action, '', signal);
    if (!result.ok) return result;

    const rows = asArray<Record<string, unknown>>(result.data);
    const categories = rows
        .map((row) => normalizeCategory(row))
        .filter((c): c is XtreamCategory => c !== undefined);
    return { ok: true, data: categories };
}

/** Omitting `category_id` mirrors Feature 19.2.7's live quirk — returns the whole VOD catalog in one call. */
export async function getVodStreams(source: XtreamSource, categoryId?: string, signal?: AbortSignal): Promise<XtreamResult<XtreamVodStream[]>> {
    const extra = categoryId !== undefined ? `&category_id=${categoryId}` : '';
    const result = await callApi(source, 'get_vod_streams', extra, signal);
    if (!result.ok) return result;

    const rows = asArray<Record<string, unknown>>(result.data);
    const streams = rows
        .map((row) => normalizeVodStream(row))
        .filter((s): s is XtreamVodStream => s !== undefined);
    return { ok: true, data: streams };
}

function normalizeVodStream(row: Record<string, unknown>): XtreamVodStream | undefined {
    const streamId = asNumber(row['stream_id']);
    const name = asString(row['name']);
    if (streamId === undefined || name === undefined) return undefined;

    const categoryId = asString(row['category_id']) ?? UNCATEGORIZED;
    const containerExtension = asString(row['container_extension'])?.trim() || 'mp4';
    const icon = asString(row['stream_icon']);
    const rating = asString(row['rating']);
    const year = asString(row['year']);
    const addedSeconds = asNumber(row['added']);
    const added = addedSeconds !== undefined ? addedSeconds * 1000 : undefined;

    return {
        streamId,
        name,
        categoryId,
        containerExtension,
        ...(icon !== undefined ? { icon } : {}),
        ...(rating !== undefined ? { rating } : {}),
        ...(year !== undefined ? { year } : {}),
        ...(added !== undefined ? { added } : {}),
    };
}

export async function getVodInfo(source: XtreamSource, vodId: number): Promise<XtreamResult<XtreamVodInfo>> {
    const result = await callApi(source, 'get_vod_info', `&vod_id=${vodId}`);
    if (!result.ok) return result;

    const payload = asRecord(result.data);
    return { ok: true, data: normalizeVodInfo(payload) };
}

function normalizeVodInfo(payload: Record<string, unknown>): XtreamVodInfo {
    const info = asRecord(payload['info']);
    const plot = asString(info['plot']);
    const genre = asString(info['genre']);
    const durationSecs = asNumber(info['duration_secs']);
    const releaseDate = asString(info['releasedate']) ?? asString(info['release_date']);
    // Panels disagree about both the key and the type: `imdb_id` arrives as
    // `"tt0111161"`, `"0111161"`, `""` or `0`, and `tmdb_id` as a number or
    // a numeric string. Both are normalized here rather than at the consumer,
    // and anything that isn't a plausible id is simply dropped — a wrong id
    // sent to a subtitle service returns a confident, empty answer.
    const imdbId = /^tt\d{5,10}$/.test(asString(info['imdb_id'])?.trim() ?? '') ? asString(info['imdb_id'])?.trim() : undefined;
    const tmdbRaw = asNumber(info['tmdb_id']) ?? asNumber(info['tmdb']);
    const tmdbId = tmdbRaw !== undefined && tmdbRaw > 0 ? tmdbRaw : undefined;

    return {
        ...(plot !== undefined ? { plot } : {}),
        ...(genre !== undefined ? { genre } : {}),
        ...(durationSecs !== undefined ? { durationSecs } : {}),
        ...(releaseDate !== undefined ? { releaseDate } : {}),
        ...(imdbId !== undefined ? { imdbId } : {}),
        ...(tmdbId !== undefined ? { tmdbId } : {}),
    };
}

export async function getSeries(source: XtreamSource, categoryId?: string, signal?: AbortSignal): Promise<XtreamResult<XtreamSeries[]>> {
    const extra = categoryId !== undefined ? `&category_id=${categoryId}` : '';
    const result = await callApi(source, 'get_series', extra, signal);
    if (!result.ok) return result;

    const rows = asArray<Record<string, unknown>>(result.data);
    const series = rows
        .map((row) => normalizeSeries(row))
        .filter((s): s is XtreamSeries => s !== undefined);
    return { ok: true, data: series };
}

function normalizeSeries(row: Record<string, unknown>): XtreamSeries | undefined {
    const seriesId = asNumber(row['series_id']);
    const name = asString(row['name']);
    if (seriesId === undefined || name === undefined) return undefined;

    const categoryId = asString(row['category_id']) ?? UNCATEGORIZED;
    const cover = asString(row['cover']);
    const plot = asString(row['plot']);
    const year = asString(row['year']);
    const rating = asString(row['rating']);

    return {
        seriesId,
        name,
        categoryId,
        ...(cover !== undefined ? { cover } : {}),
        ...(plot !== undefined ? { plot } : {}),
        ...(year !== undefined ? { year } : {}),
        ...(rating !== undefined ? { rating } : {}),
    };
}

/** `get_series_info`'s `episodes` field is the only part of the payload with shape chaos (Feature 21.5.4) — the coercion itself lives in `series-coerce.ts` so this stays a thin fetch-and-hand-off. */
export async function getSeriesInfo(source: XtreamSource, seriesId: number): Promise<XtreamResult<XtreamSeriesInfo>> {
    const result = await callApi(source, 'get_series_info', `&series_id=${seriesId}`);
    if (!result.ok) return result;

    const payload = asRecord(result.data);
    return { ok: true, data: coerceSeriesInfo(payload['episodes']) };
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}
