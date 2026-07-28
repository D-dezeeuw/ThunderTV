/**
 * Pure, DOM-independent math for the Guide timetable (kept out of
 * `guide.selectors.ts` so it's directly unit-testable): the visible time
 * window, program-block placement within it, and local-timezone display
 * formatting. `Intl.DateTimeFormat` with no explicit `timeZone` resolves the
 * browser's local zone (and its current offset) for the instant given —
 * DST-correct by construction, no manual offset math needed here (the
 * offset math XMLTV timestamps themselves need lives in `src/epg/xmltv.ts`,
 * on the ingestion side).
 */

/** The grid shows a rolling 4h window — enough to see "now" plus a few upcoming slots without needing horizontal scroll UI. */
export const GUIDE_WINDOW_MS = 4 * 60 * 60 * 1000;

const HALF_HOUR_MS = 30 * 60 * 1000;

/** Floors a timestamp to the previous half-hour mark, so the window's left edge sits on a stable grid line instead of drifting with the exact "now" millisecond. */
export function floorToHalfHour(ms: number): number {
    return Math.floor(ms / HALF_HOUR_MS) * HALF_HOUR_MS;
}

export interface GuideWindow {
    start: number;
    end: number;
}

export function computeGuideWindow(nowMs: number): GuideWindow {
    const start = floorToHalfHour(nowMs);
    return { start, end: start + GUIDE_WINDOW_MS };
}

/** Percent position of `ms` across `[rangeStart, rangeEnd]`, clamped to `[0, 100]` — shared by the "now" line and program-block placement so both agree on the same grid. */
export function percentInRange(ms: number, rangeStart: number, rangeEnd: number): number {
    const span = rangeEnd - rangeStart;
    if (span <= 0) return 0;
    return Math.min(100, Math.max(0, ((ms - rangeStart) / span) * 100));
}

export interface ProgramLayout {
    leftPercent: number;
    widthPercent: number;
}

/** A program block's left offset and width within the visible window, clipped at both edges — a programme that started before the window or ends after it still renders, just truncated. */
export function computeProgramLayout(start: number, stop: number, rangeStart: number, rangeEnd: number): ProgramLayout {
    const leftPercent = percentInRange(start, rangeStart, rangeEnd);
    const rightPercent = percentInRange(stop, rangeStart, rangeEnd);
    return { leftPercent, widthPercent: Math.max(0, rightPercent - leftPercent) };
}

export function isProgramNow(nowMs: number, start: number, stop: number): boolean {
    return nowMs >= start && nowMs < stop;
}

/** Local-timezone `HH:mm`. No `timeZone` option — resolves the browser's local zone for `ms`'s instant, correct across a DST transition without any manual adjustment. */
export function formatClockTime(ms: number, locale?: string): string {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

export function formatTimeRange(startMs: number, stopMs: number, locale?: string): string {
    return `${formatClockTime(startMs, locale)}–${formatClockTime(stopMs, locale)}`;
}
