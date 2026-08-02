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

/**
 * How far behind "now" the window reaches. Starting the window *at* the
 * clock (the original behaviour) pinned the now-line to the left edge and
 * clipped every currently-airing programme to its remaining sliver — the
 * viewer could never see what a running programme *is*, only what's left of
 * it. An hour of past keeps the airing blocks whole (most slots are ≤1h)
 * and puts the now-line visibly inside them.
 */
export const GUIDE_PAST_MS = 60 * 60 * 1000;

/** The grid shows a rolling 5h window — an hour of past (`GUIDE_PAST_MS`) plus "now" and up to 4h of upcoming slots, without needing horizontal scroll UI. */
export const GUIDE_WINDOW_MS = GUIDE_PAST_MS + 4 * 60 * 60 * 1000;

/**
 * One step of the prev/next time controls (Phase 32). Half a window rather
 * than a whole one: a full-window jump leaves no shared programmes between
 * the before and after states, so the eye loses its place; a half-window
 * step always keeps the previous view's second half on screen as an anchor.
 */
export const GUIDE_SHIFT_MS = GUIDE_WINDOW_MS / 2;

/**
 * How far back and forward the controls may travel. Backward is capped at
 * the programme-retention horizon (`src/epg/prune.ts` deletes anything more
 * than 24h past its stop, so scrolling further back can only ever show
 * empty track); forward at 7 days, past any realistic XMLTV feed's own
 * horizon. Both are clamped rather than disabled so the buttons never
 * become dead ends the user has to guess about.
 */
export const GUIDE_MIN_OFFSET_MS = -24 * 60 * 60 * 1000;
export const GUIDE_MAX_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

export function clampGuideOffset(offsetMs: number): number {
    if (!Number.isFinite(offsetMs)) return 0;
    return Math.min(GUIDE_MAX_OFFSET_MS, Math.max(GUIDE_MIN_OFFSET_MS, offsetMs));
}

const HALF_HOUR_MS = 30 * 60 * 1000;

/** Floors a timestamp to the previous half-hour mark, so the window's left edge sits on a stable grid line instead of drifting with the exact "now" millisecond. */
export function floorToHalfHour(ms: number): number {
    return Math.floor(ms / HALF_HOUR_MS) * HALF_HOUR_MS;
}

export interface GuideWindow {
    start: number;
    end: number;
}

/** The visible window: `GUIDE_PAST_MS` behind the given instant (floored to a half-hour grid line) through the rest of `GUIDE_WINDOW_MS` ahead — so "now" lands inside the currently-airing blocks rather than on the window's left edge. */
export function computeGuideWindow(nowMs: number): GuideWindow {
    const start = floorToHalfHour(nowMs - GUIDE_PAST_MS);
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

/**
 * Local-timezone `HH:mm`, always on a 24-hour clock.
 *
 * Two deliberate choices, both bugs before:
 *
 * - **`hourCycle: 'h23'`.** Without it, `{hour, minute}` renders whatever
 *   the *resolved* locale prefers — `en-US` gives `"02:30 PM"`. In a guide
 *   cell narrow enough to clip the suffix that reads as 2:30 when the
 *   programme is at 14:30, which is precisely the "time is wrong" report.
 *   A timetable grid is 24-hour everywhere this app ships; pinning it means
 *   the label can't depend on which locale the TV happens to boot in.
 * - **An explicit `locale`.** Passing `undefined` resolves the *runtime's*
 *   locale, not the app's `settings.locale` — so a viewer who set Dutch
 *   still got the webview's default. Callers pass the app locale
 *   (`guide.selectors.ts` binds `SETTINGS_LOCALE` as a dep for exactly
 *   this).
 *
 * Still no `timeZone` option: the local zone for `ms`'s instant is correct
 * across a DST transition with no manual adjustment.
 */
export function formatClockTime(ms: number, locale?: string): string {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

export function formatTimeRange(startMs: number, stopMs: number, locale?: string): string {
    return `${formatClockTime(startMs, locale)}–${formatClockTime(stopMs, locale)}`;
}

/**
 * Weekday + day/month for the window's own date, shown only once the grid
 * has been shifted off "now" (Phase 32) — while the window tracks the clock
 * the date is whatever today is, and saying so is noise. Same no-`timeZone`
 * reasoning as `formatClockTime`: local zone, DST-correct for that instant.
 */
export function formatWindowDate(ms: number, locale?: string): string {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms));
}

function formatUnit(value: number, unit: 'hour' | 'minute', locale?: string): string {
    return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value);
}

/**
 * How long a programme runs, as locale-aware text — `"1 hr 30 min"`,
 * `"45 min"`. Shown in the programme detail modal, where the start/stop
 * range alone makes the viewer do the subtraction.
 *
 * `Intl.NumberFormat`'s unit style rather than a translated `"{n} min"`
 * template: it already knows each locale's abbreviation and plural rules, so
 * there is no third copy of the same string to keep in sync and no locale
 * that ends up with an English suffix. A non-positive span (a malformed feed
 * row where `stop <= start`) returns `''` and the modal simply omits the
 * line, rather than printing `"0 min"` as if that were a fact.
 */
export function formatDuration(startMs: number, stopMs: number, locale?: string): string {
    const totalMinutes = Math.round((stopMs - startMs) / 60_000);
    if (totalMinutes <= 0) return '';

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(formatUnit(hours, 'hour', locale));
    if (minutes > 0) parts.push(formatUnit(minutes, 'minute', locale));
    return parts.join(' ');
}
