/**
 * The two keyless, CORS-open endpoints this feature is built on, as pure URL
 * builders and pure response parsers. No I/O here — `client.ts` owns that, so
 * every shape decision below is testable against a captured payload.
 *
 * Why these two, and why nothing needs an API key: see
 * `src/core/subtitles/README.md`. Both are Stremio addon-protocol services,
 * which is the whole reason they work from a browser at all — the protocol
 * exists to be called by a web client, so `Access-Control-Allow-Origin: *` is
 * a requirement of it rather than a courtesy.
 */
import { toIso6391 } from './languages';
import type { TitleCandidate } from './identify';

/** Cinemeta: the Stremio catalog addon. Used only to turn a title + year into an IMDb id — never for artwork or plots, which the provider already gave us. */
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';
/** The OpenSubtitles v3 Stremio addon: keyless search by IMDb id, returning direct, CORS-open download URLs. */
const SUBTITLES_BASE = 'https://opensubtitles-v3.strem.io';

export type TitleKind = 'movie' | 'series';

export function titleSearchUrl(kind: TitleKind, query: string): string {
    return `${CINEMETA_BASE}/catalog/${kind}/top/search=${encodeURIComponent(query)}.json`;
}

/** `contentId` is `identify.ts`'s `contentIdFor()` output — `tt…` or `tt…:season:episode`. */
export function subtitleSearchUrl(kind: TitleKind, contentId: string): string {
    return `${SUBTITLES_BASE}/subtitles/${kind}/${encodeURIComponent(contentId)}.json`;
}

/**
 * Cinemeta's `metas[]`, keeping only rows that carry a usable `tt…` id.
 * `releaseInfo` is the year field that is actually always present (`year` is
 * often null, and a series' reads `2008-2013`), so the leading year is taken
 * from it.
 */
export function parseTitleCandidates(payload: unknown): TitleCandidate[] {
    const metas = asArray(asRecord(payload)['metas']);
    const candidates: TitleCandidate[] = [];
    for (const raw of metas) {
        const meta = asRecord(raw);
        const id = asString(meta['imdb_id']) ?? asString(meta['id']);
        const name = asString(meta['name']);
        if (!id || !/^tt\d+$/.test(id) || !name) continue;
        const info = asString(meta['releaseInfo']) ?? asString(meta['year']) ?? '';
        const yearMatch = /(19|20)\d{2}/.exec(info);
        candidates.push({ imdbId: id, name, year: yearMatch ? Number(yearMatch[0]) : null });
    }
    return candidates;
}

/** One subtitle file the service is offering, before any language filtering. */
export interface RawSubtitle {
    /** The service's own id, unique within one response — the menu row's `data-value`. */
    id: string;
    url: string;
    /** ISO 639-1, already folded from whichever 639-2 variant the row carried. */
    lang: string;
}

/**
 * The addon's `subtitles[]`. Rows without a `url` are dropped rather than
 * offered as an entry that cannot be downloaded, and duplicate ids (the
 * service does repeat them across releases) keep the first occurrence so a
 * menu row always resolves to exactly one file.
 */
export function parseSubtitleList(payload: unknown): RawSubtitle[] {
    const rows = asArray(asRecord(payload)['subtitles']);
    const seen = new Set<string>();
    const out: RawSubtitle[] = [];
    for (const raw of rows) {
        const row = asRecord(raw);
        const url = asString(row['url']);
        const id = asString(row['id']) ?? url;
        if (!url || !id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, url, lang: toIso6391(asString(row['lang']) ?? '') });
    }
    return out;
}

/**
 * Preferred language first, then everything else, capped. The other languages
 * are kept on purpose: a film with no Dutch subtitle but four English ones is
 * a case where the viewer would rather be shown the English ones than told
 * "none found", and the rows say which language each is.
 */
export function orderByLanguage(subtitles: readonly RawSubtitle[], preferred: string, cap: number): RawSubtitle[] {
    const want = toIso6391(preferred);
    const preferredRows = subtitles.filter((row) => row.lang === want);
    const rest = subtitles.filter((row) => row.lang !== want);
    return [...preferredRows, ...rest].slice(0, cap);
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number') return String(value);
    return undefined;
}
