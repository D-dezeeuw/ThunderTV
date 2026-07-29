import type { EpgChannelRecord, EpgProgramRecord } from '../core/storage';

/**
 * XMLTV parsing (README's "Phase 16 — EPG Ingestion" / Phase 31's country
 * catalog): timestamp math and `<channel>`/`<programme>` extraction shared
 * by `src/epg/catalog.ts` (catalog derivation) and `src/state/epg-load.ts`
 * (the Guide's `epgChannels`/`epgPrograms` tables) — one parse per fetched
 * file, two consumers. Fetching itself lives in `src/epg/feed-fetch.ts`;
 * this module used to also own a hardcoded NL-only fetch/match pair
 * (`XMLTV_SOURCE_URLS`/`matchXmltvChannels`), replaced by the
 * registry-driven, alias-aware pipeline in Phase 31.
 */

export interface XmltvChannel {
    /** The feed's own channel id, e.g. `"24 Kitchen.nl"` — human-readable, not opaque, per the open-epg convention this feed follows. */
    id: string;
    displayName: string;
    icon: string | null;
}

export interface XmltvProgram {
    channelId: string;
    /** Epoch milliseconds, UTC — converted from the XMLTV `YYYYMMDDHHMMSS ±HHMM` timestamp (Feature: no reliance on browser-local time for the underlying data, only for later display formatting). */
    start: number;
    stop: number;
    title: string;
    description: string | null;
}

export interface XmltvDocument {
    channels: XmltvChannel[];
    programs: XmltvProgram[];
}

const XMLTV_TIMESTAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?$/;

/**
 * Parses XMLTV's `start`/`stop` timestamp format into a correct UTC epoch
 * ms value. The digits are a *local* wall-clock reading at the trailing
 * `±HHMM` offset (or UTC when the offset is omitted) — `Date.UTC()` first
 * reads them as if they already were UTC, then the offset is subtracted to
 * land on the real UTC instant. This is exact, explicit-offset arithmetic
 * (the spec always carries the offset), never a DST guess.
 */
export function parseXmltvTimestamp(raw: string): number | null {
    const match = XMLTV_TIMESTAMP_PATTERN.exec(raw.trim());
    if (!match) return null;

    const [, y, mo, d, h, mi, s, offset] = match as unknown as [string, string, string, string, string, string, string, string | undefined];
    const naiveUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    if (Number.isNaN(naiveUtcMs)) return null;

    if (!offset) return naiveUtcMs;

    const sign = offset[0] === '-' ? -1 : 1;
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = Number(offset.slice(3, 5));
    const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60_000;
    return naiveUtcMs - offsetMs;
}

function textOf(el: Element | null): string | null {
    const text = el?.textContent?.trim();
    return text && text.length > 0 ? text : null;
}

/** Parses one XMLTV document's `<channel>`/`<programme>` elements. Malformed individual elements (bad timestamp, missing id) are skipped rather than failing the whole document — one bad row in a 370-channel feed must not lose the rest. */
export function parseXmltvDocument(xmlText: string): XmltvDocument {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return { channels: [], programs: [] };

    const channels: XmltvChannel[] = [];
    for (const el of Array.from(doc.getElementsByTagName('channel'))) {
        const id = el.getAttribute('id');
        const displayName = textOf(el.querySelector('display-name'));
        if (!id || !displayName) continue;
        const icon = el.querySelector('icon')?.getAttribute('src') ?? null;
        channels.push({ id, displayName, icon });
    }

    const programs: XmltvProgram[] = [];
    for (const el of Array.from(doc.getElementsByTagName('programme'))) {
        const channelId = el.getAttribute('channel');
        const startRaw = el.getAttribute('start');
        const stopRaw = el.getAttribute('stop');
        const title = textOf(el.querySelector('title'));
        if (!channelId || !startRaw || !stopRaw || !title) continue;

        const start = parseXmltvTimestamp(startRaw);
        const stop = parseXmltvTimestamp(stopRaw);
        if (start === null || stop === null) continue;

        programs.push({ channelId, start, stop, title, description: textOf(el.querySelector('desc')) });
    }

    return { channels, programs };
}

/** Maps a matched subset of one parsed document into the storage record shapes (Feature: keeps `EpgProgramRecord.channelId` equal to the feed's own channel id — `raw-export.ts`'s documented "tvg-id a channel row must carry" contract, since this feed's ids already follow that convention for a matched channel). */
export function toEpgRecords(doc: XmltvDocument, matchedChannelIds: ReadonlySet<string>): {
    channels: EpgChannelRecord[];
    programs: EpgProgramRecord[];
} {
    const channels = doc.channels
        .filter((c) => matchedChannelIds.has(c.id))
        .map((c): EpgChannelRecord => ({ id: c.id, displayName: c.displayName, icon: c.icon }));

    const programs = doc.programs
        .filter((p) => matchedChannelIds.has(p.channelId))
        .map((p): EpgProgramRecord => ({
            channelId: p.channelId,
            start: p.start,
            stop: p.stop,
            title: p.title,
            description: p.description,
        }));

    return { channels, programs };
}
