import { appState, getPathObj } from 'spektrum';
import { lookupCatalog } from '../channels/dutch-catalog';
import { classifyJunk } from '../channels/junk-filter';
import { parseCategoryName, parseChannelName } from '../channels/name-parse';
import { getRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { isHiddenSource } from './hidden-sources';
import { liveChannels } from './live-rows';
import type { PlaylistSourceSummary } from './playlist';
import { persistedKeys } from './registry';

/**
 * Full-configuration export (Settings → Export configuration).
 *
 * Exists to answer "why is my channel not showing?" without guessing: it
 * dumps every setting, every source, and — the part that actually matters —
 * each channel's raw provider name *next to* what the filter made of it
 * (parsed country/quality/base, catalog match, junk verdict). A name the
 * catalog fails to recognize is visible at a glance.
 *
 * Credentials are redacted throughout. This file is meant to be shared for
 * diagnosis, and an Xtream username/password embedded in a stream URL would
 * otherwise travel with it.
 */

/** Channel rows written out in full. A 90k-row source would otherwise produce a file too large to open; the cap is recorded in the XML so a truncated export never reads as a complete one. */
const CHANNEL_CAP = 20_000;

export interface ExportContext {
    /** Injected rather than read from a clock so the export is reproducible in a test. */
    generatedAt: string;
    appVersion: string;
}

function esc(value: unknown): string {
    // Objects reach here only through `settingsSection`, which JSON-stringifies
    // first; anything else that slips through is coerced deliberately rather
    // than emitting "[object Object]" into a diagnostic file.
    const primitive =
        value === null || value === undefined
            ? ''
            : typeof value === 'object'
              ? JSON.stringify(value)
              : (value as string | number | boolean);
    return String(primitive)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Strips anything credential-shaped from a URL: `user:pass@` userinfo, and
 * the `username`/`password`/`token` query parameters Xtream panels use.
 * Falls back to dropping the whole URL if it cannot be parsed — better a
 * useless field than a leaked one.
 */
export function redactUrl(url: string | null): string {
    if (!url) return '';
    try {
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`;
        const parsed = new URL(withScheme);
        parsed.username = '';
        parsed.password = '';
        for (const key of ['username', 'password', 'token', 'pass', 'user']) {
            if (parsed.searchParams.has(key)) parsed.searchParams.set(key, 'REDACTED');
        }
        // Xtream stream paths embed credentials as path segments
        // (/live/<user>/<pass>/<id>.ts), which no query-param scrub catches.
        const path = parsed.pathname.replace(
            /^\/(live|movie|series)\/[^/]+\/[^/]+\//i,
            '/$1/REDACTED/REDACTED/',
        );
        parsed.pathname = path;
        return parsed.toString();
    } catch {
        return '[unparseable url redacted]';
    }
}

function tag(name: string, attrs: Record<string, unknown>, indent: string): string {
    const rendered = Object.entries(attrs)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(' ');
    return `${indent}<${name}${rendered ? ' ' + rendered : ''} />`;
}

function settingsSection(): string {
    const lines: string[] = ['  <settings>'];
    // Driven off the registry rather than a hand-kept list, so a setting
    // added later cannot silently go missing from a diagnostic export.
    for (const key of persistedKeys().sort()) {
        const value = getPathObj<unknown>(appState, key);
        lines.push(
            tag('setting', { key, value: typeof value === 'object' ? JSON.stringify(value) : value }, '    '),
        );
    }
    lines.push('  </settings>');
    return lines.join('\n');
}

function sourcesSection(): string {
    const sources = getPathObj<PlaylistSourceSummary[]>(appState, 'playlist.sources') ?? [];
    const activeId = getPathObj<string | null>(appState, 'playlist.activeSourceId') ?? '';
    const lines: string[] = [`  <sources count="${sources.length}" active="${esc(activeId)}">`];
    for (const source of sources) {
        lines.push(
            tag(
                'source',
                {
                    id: source.id,
                    name: source.name,
                    type: source.type,
                    url: redactUrl(source.url),
                    channelCount: source.channelCount,
                    groupCount: source.groupCount,
                    radioCount: source.radioCount,
                    skipped: source.skipped,
                    needsReupload: source.needsReupload,
                    hiddenFromPicker: isHiddenSource(source),
                    active: source.id === activeId,
                },
                '    ',
            ),
        );
    }
    lines.push('  </sources>');
    return lines.join('\n');
}

function liveFilterSection(): string {
    const stats = getPathObj<Record<string, unknown>>(appState, 'live.stats') ?? {};
    const grouped = liveChannels();
    const lines: string[] = ['  <live-filter>'];
    lines.push(tag('stats', stats, '    '));
    lines.push(`    <resulting-channels count="${grouped.length}">`);
    for (const channel of grouped) {
        lines.push(
            tag(
                'channel',
                { name: channel.name, key: channel.key, known: channel.isKnown, rank: channel.rank, variants: channel.variants.length },
                '      ',
            ),
        );
    }
    lines.push('    </resulting-channels>');
    lines.push('  </live-filter>');
    return lines.join('\n');
}

/**
 * The diagnostic core: each provider row with the filter's own reading of
 * it beside the raw name. `catalogMatch` empty on a channel that should be
 * in the curated list is the exact signature of a naming mismatch.
 */
function channelsSection(rows: readonly ChannelRow[]): string {
    const shown = rows.slice(0, CHANNEL_CAP);
    const lines: string[] = [
        `  <channels total="${rows.length}" exported="${shown.length}" truncated="${rows.length > shown.length}">`,
    ];
    for (const row of shown) {
        const parsed = parseChannelName(row.name);
        const junk = classifyJunk(parsed);
        const known = lookupCatalog(parsed.key);
        lines.push(
            tag(
                'channel',
                {
                    raw: row.name,
                    group: row.group,
                    groupCountry: parseCategoryName(row.group ?? '').country,
                    radio: row.radio,
                    parsedCountry: parsed.country,
                    parsedBase: parsed.base,
                    parsedKey: parsed.key,
                    quality: parsed.quality,
                    isRecording: parsed.isRecording,
                    catalogMatch: known?.canonical ?? '',
                    junk: junk.isJunk ? (junk.reason ?? 'yes') : '',
                    url: redactUrl(row.url),
                },
                '    ',
            ),
        );
    }
    lines.push('  </channels>');
    return lines.join('\n');
}

/** Builds the whole export document. Reads live state and the in-memory channel array; performs no I/O. */
export function buildConfigXml(context: ExportContext): string {
    const rows = getRows();
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!--',
        '  ThunderTV configuration export.',
        '  Credentials are redacted: URL userinfo, username/password/token query',
        '  parameters, and Xtream /live/<user>/<pass>/ path segments are replaced',
        '  before writing. Check before sharing regardless.',
        '-->',
        `<thundertv-export version="1" generatedAt="${esc(context.generatedAt)}" appVersion="${esc(context.appVersion)}">`,
        tag(
            'environment',
            {
                platform: getPathObj<string>(appState, 'platform.name'),
                storageTier: getPathObj<string>(appState, 'storage.tier'),
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
                activeView: getPathObj<string>(appState, 'ui.activeView'),
            },
            '  ',
        ),
        settingsSection(),
        sourcesSection(),
        liveFilterSection(),
        channelsSection(rows),
        '</thundertv-export>',
        '',
    ].join('\n');
}
