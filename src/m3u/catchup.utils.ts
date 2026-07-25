const XMLTV_TIMESTAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{2})(\d{2})$/;

type CatchupSupportMode = 'none' | 'source' | 'shift';

/**
 * Ported from thunder-tv's `libs/shared/m3u-utils/src/lib/catchup.utils.ts`
 * (Feature 06.1.5) as the plan's explicit door-opener — a real catchup
 * feature doesn't exist yet, so this file is excluded from `src/m3u/index.ts`'s
 * barrel export path (imported directly from `'./catchup.utils'` when
 * needed) to keep it out of the bundle by tree-shaking until then.
 *
 * Operates on the *raw* parser-shaped fields (`tvg.rec`, `timeshift`,
 * `catchup.{type,source,days}`) rather than the flat `ChannelRow` — those
 * fields are deliberately not retained on `ChannelRow` (Feature 06.5.1's
 * flat, storage-ready shape), so this module declares its own narrow
 * `CatchupChannelLike` parameter type instead of depending on `ChannelRow`.
 * A future catchup feature (door left open, not yet walked through) decides
 * how these fields actually reach the row shape.
 */
export interface CatchupChannelLike {
    url?: string | undefined;
    timeshift?: string | undefined;
    tvg?: { rec?: string | undefined } | undefined;
    catchup?:
        | { type?: string | undefined; source?: string | undefined; days?: string | undefined }
        | undefined;
}

export interface CatchupProgramLike {
    start: string;
    startTimestamp?: number | string | null;
}

export function getM3uArchiveDays(channel: CatchupChannelLike | null | undefined): number {
    const value = getFirstNonBlankValue(
        channel?.catchup?.days,
        channel?.timeshift,
        channel?.tvg?.rec,
    );
    return Math.max(0, Number(value ?? 0) || 0);
}

export function isM3uCatchupPlaybackSupported(
    channel: CatchupChannelLike | null | undefined,
): boolean {
    return getM3uCatchupSupportMode(channel) !== 'none';
}

export function resolveM3uCatchupUrl(
    channel: CatchupChannelLike | null | undefined,
    program: CatchupProgramLike,
    nowTimestampSeconds = Math.floor(Date.now() / 1000),
): string | null {
    const supportMode = getM3uCatchupSupportMode(channel);
    if (supportMode === 'none') {
        return null;
    }

    const startTimestamp = getEpgProgramTimestampSeconds(program.start, program.startTimestamp);
    if (startTimestamp === null) {
        return null;
    }

    const playbackBaseUrl = supportMode === 'source' ? channel?.catchup?.source : channel?.url;
    if (!playbackBaseUrl?.trim()) {
        return null;
    }

    const normalizedNow =
        Number.isFinite(nowTimestampSeconds) && nowTimestampSeconds > 0
            ? Math.floor(nowTimestampSeconds)
            : Math.floor(Date.now() / 1000);

    return setCatchupQueryParams(playbackBaseUrl, {
        utc: startTimestamp,
        lutc: normalizedNow,
    });
}

function getM3uCatchupSupportMode(
    channel: CatchupChannelLike | null | undefined,
): CatchupSupportMode {
    if (getM3uArchiveDays(channel) <= 0) {
        return 'none';
    }

    const catchupSource = channel?.catchup?.source?.trim() ?? '';
    if (isHttpUrl(catchupSource)) {
        return 'source';
    }

    const streamUrl = channel?.url?.trim() ?? '';
    const catchupType = channel?.catchup?.type?.trim().toLowerCase() ?? '';
    if (catchupType === 'shift' && isHttpUrl(streamUrl)) {
        return 'shift';
    }

    if (!catchupType && isHttpUrl(streamUrl)) {
        return 'shift';
    }

    return 'none';
}

function getEpgProgramTimestampSeconds(
    dateValue: string,
    unixTimestampValue?: number | string | null,
): number | null {
    const unixTimestamp = Number.parseInt(String(unixTimestampValue ?? ''), 10);
    if (Number.isFinite(unixTimestamp) && unixTimestamp > 0) {
        return unixTimestamp;
    }

    const parsed = Date.parse(dateValue);
    if (Number.isFinite(parsed)) {
        return Math.floor(parsed / 1000);
    }

    const match = dateValue.match(XMLTV_TIMESTAMP_PATTERN);
    if (!match) {
        return null;
    }

    // The pattern has exactly 7 mandatory capturing groups, all present
    // whenever `match` succeeds — TS types capture groups as possibly
    // `undefined` regardless, since it can't see the pattern is exhaustive.
    const [, year, month, day, hour, minute, offsetHours, offsetMinutes] = match as unknown as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
    ];
    const utcMillis = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
    );
    // Derive the sign from the string: for offsets like "-0030" the hour part
    // is "-00", and Number("-00") === -0, so Math.sign() would drop the
    // minutes' sign and yield a zero offset instead of -30 minutes.
    const offsetSign = offsetHours.startsWith('-') ? -1 : 1;
    const offsetTotalMinutes =
        offsetSign * (Math.abs(Number(offsetHours)) * 60 + Number(offsetMinutes));

    return Math.floor((utcMillis - offsetTotalMinutes * 60_000) / 1000);
}

function setCatchupQueryParams(
    rawUrl: string,
    params: Record<'utc' | 'lutc', number>,
): string | null {
    try {
        const url = new URL(rawUrl.trim());
        url.searchParams.set('utc', String(params.utc));
        url.searchParams.set('lutc', String(params.lutc));
        return url.toString();
    } catch {
        return null;
    }
}

function isHttpUrl(value: string): boolean {
    if (!value) {
        return false;
    }

    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function getFirstNonBlankValue(...values: Array<string | null | undefined>): string | undefined {
    return values.find((value): value is string => value != null && value.trim() !== '');
}
