import { rawCaptures, type RawCapture } from '../core/raw-capture';
import { getPlatform } from '../core/platform';
import type { EpgChannelRecord, EpgProgramRecord } from '../core/storage';
import type { ExportContext } from './config-export';

/**
 * Two raw-data exports that sit beside the configuration export.
 *
 * The configuration export shows what the app made of the provider's data.
 * These show the data itself: `buildRawResponsesXml()` wraps each captured
 * server response byte-for-byte, and `buildEpgXml()` dumps the stored guide.
 * When the derived view and the raw source disagree, the bug is ours — and
 * that comparison is impossible from the transformed side alone.
 */

function esc(value: string | number | boolean | null | undefined): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Wraps a body in CDATA without letting it terminate the section early.
 * The payload is JSON or M3U text, so it is kept verbatim rather than
 * entity-escaped — the whole point is that it can be diffed against what
 * the provider serves.
 */
function cdata(body: string): string {
    return `<![CDATA[${body.split(']]>').join(']]]]><![CDATA[>')}]]>`;
}

function captureElement(capture: RawCapture, index: number): string {
    return [
        `  <response index="${index}" label="${esc(capture.label)}" status="${capture.status}"`,
        ` contentType="${esc(capture.contentType)}" length="${capture.length}" truncated="${capture.truncated}"`,
        ` url="${esc(capture.url)}">`,
        '\n    ',
        cdata(capture.body),
        '\n  </response>',
    ].join('');
}

export function buildRawResponsesXml(context: ExportContext): string {
    const captures = rawCaptures();
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!--',
        '  Untouched provider responses captured during this browser session.',
        '  Bodies are byte-for-byte as received, with one exception: Xtream',
        '  echoes the account username and password back inside user_info, so',
        '  those two JSON fields are replaced with REDACTED. Nothing else is',
        '  altered. Request URLs are credential-redacted.',
        '',
        '  Captures live in memory only, so a page reload empties this file.',
        '  Re-import the source, or use Settings > Streaming > Refresh, then',
        '  export again.',
        '-->',
        `<thundertv-raw-responses version="1" generatedAt="${esc(context.generatedAt)}" count="${captures.length}">`,
        ...captures.map((capture, i) => captureElement(capture, i)),
        '</thundertv-raw-responses>',
        '',
    ].join('\n');
}

/** Guide rows exported in full. A multi-day XMLTV load across hundreds of channels runs to millions of rows; the cap is recorded so a truncated export never reads as complete. */
const PROGRAM_CAP = 200_000;

export async function buildEpgXml(context: ExportContext): Promise<string> {
    const storage = getPlatform().storage;
    let channels: EpgChannelRecord[] = [];
    let programs: EpgProgramRecord[] = [];
    let readError = '';

    try {
        channels = await storage.getAll('epgChannels');
        programs = await storage.getAll('epgPrograms');
    } catch (error) {
        // A storage tier without these tables must still produce a valid
        // file that says so, rather than failing the whole export.
        readError = error instanceof Error ? error.message : 'unknown storage error';
    }

    const shown = programs.slice(0, PROGRAM_CAP);
    const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!--',
        '  EPG as stored by ThunderTV, after XMLTV parsing. Times are epoch',
        '  milliseconds; `channelId` is the tvg-id a channel row must carry to',
        '  match a guide entry, so an empty guide next to a populated channel',
        '  list usually means tvg-id and EPG channel id disagree.',
        '-->',
        `<thundertv-epg version="1" generatedAt="${esc(context.generatedAt)}"${readError ? ` readError="${esc(readError)}"` : ''}>`,
        `  <channels count="${channels.length}">`,
        ...channels.map(
            (channel) =>
                `    <channel id="${esc(channel.id)}" displayName="${esc(channel.displayName)}" icon="${esc(channel.icon)}" />`,
        ),
        '  </channels>',
        `  <programs total="${programs.length}" exported="${shown.length}" truncated="${programs.length > shown.length}">`,
        ...shown.map(
            (program) =>
                `    <program channelId="${esc(program.channelId)}" start="${program.start}" stop="${program.stop}"` +
                ` startIso="${esc(new Date(program.start).toISOString())}" title="${esc(program.title)}">` +
                `${esc(program.description)}</program>`,
        ),
        '  </programs>',
        '</thundertv-epg>',
        '',
    ];
    return lines.join('\n');
}
