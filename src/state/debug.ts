import { appState, setValue } from 'spektrum';
import type { Route } from '../app/router';
import { getRows } from '../m3u/channel-memory';
import { ensureRadioRows, radioDisplayRows } from './live-rows';
import type { PlaylistSourceSummary } from './playlist';
import { replace } from './typed';

/**
 * An on-screen console.
 *
 * ThunderTV runs on a phone, a TV and a packaged Electron window as much as
 * it does in a browser tab, and on none of those can anyone open devtools.
 * When a view comes up blank the only question that matters is *why*, and
 * the answer is usually one uncaught error plus three or four bits of
 * state. Both are collected here and rendered by the debug panel
 * (index.html), so the whole diagnosis is one screenshot.
 *
 * Capture is installed first thing in `bootstrap()` — before the platform
 * is even constructed — because the errors most worth seeing are the ones
 * that happen before anything renders.
 */
export const DEBUG_OPEN = 'debug.open';
export const DEBUG_ENTRIES = 'debug.entries';
export const DEBUG_SNAPSHOT = 'debug.snapshot';
export const DEBUG_ERROR_COUNT = 'debug.errorCount';

/** Enough to hold a boot's worth of noise, few enough to render as a list. */
export const DEBUG_ENTRY_CAP = 100;

export interface DebugEntry {
    /** Seconds since boot — a wall clock says nothing useful in a screenshot. */
    at: string;
    level: 'error' | 'warn' | 'info';
    text: string;
}

/**
 * The state a blank view actually turns on. Deliberately flat strings: this
 * is read off a screen, not parsed.
 */
export interface DebugSnapshot {
    view: string;
    sourceCount: number;
    activeSourceId: string;
    activeSourceResolved: string;
    channelCount: number;
    rowsInMemory: number;
    liveChannels: number;
    radioCount: number;
    storageTier: string;
    platform: string;
    /** Set when the state is internally inconsistent — the one line worth reading first. */
    diagnosis: string;
}

let entries: DebugEntry[] = [];
let errorCount = 0;
let installed = false;
let bootedAt = 0;

function stamp(): string {
    return `+${((Date.now() - bootedAt) / 1000).toFixed(1)}s`;
}

/** Arguments arrive as anything at all, including DOM nodes and Errors — this must never itself throw. */
function stringify(args: readonly unknown[]): string {
    return args
        .map((arg) => {
            if (typeof arg === 'string') return arg;
            if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
            try {
                return JSON.stringify(arg) ?? String(arg);
            } catch {
                return String(arg);
            }
        })
        .join(' ')
        .slice(0, 500);
}

function push(level: DebugEntry['level'], text: string): void {
    if (text.length === 0) return;
    entries = [...entries.slice(-(DEBUG_ENTRY_CAP - 1)), { at: stamp(), level, text }];
    if (level === 'error') errorCount += 1;
    // Arrays go through `replace()`: Spektrum's setValue deep-merges, which
    // would leave a longer previous array's tail behind after a clear.
    replace(DEBUG_ENTRIES, entries);
    setValue(DEBUG_ERROR_COUNT, errorCount);
}

/**
 * Wraps the console and the two global failure events. Idempotent, and it
 * always calls through to the original console — this observes, it never
 * replaces the real thing.
 */
export function installDebugCapture(now = Date.now()): void {
    if (installed) return;
    installed = true;
    bootedAt = now;

    for (const level of ['error', 'warn', 'info'] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]): void => {
            push(level, stringify(args));
            original(...args);
        };
    }

    window.addEventListener('error', (event) => {
        const detail = event.error instanceof Error ? `${event.error.name}: ${event.error.message}` : event.message;
        push('error', `uncaught ${detail} (${event.filename}:${String(event.lineno)})`);
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason: unknown = event.reason;
        push('error', `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
    });
}

interface DebugShapedState {
    ui?: { activeView?: Route };
    playlist?: { sources?: PlaylistSourceSummary[]; activeSourceId?: string | null };
    live?: { stats?: { channels?: number; inputRows?: number }; radioCount?: number };
    storage?: { tier?: string };
    platform?: { name?: string };
}

/**
 * Names the inconsistency, when there is one. Every case here has been the
 * cause of a blank view at least once — an id pointing at a source that is
 * no longer in storage is the common one, and it is invisible from the UI
 * because the views it breaks render nothing at all.
 */
function diagnose(state: DebugShapedState, rowsInMemory: number): string {
    const sources = state.playlist?.sources ?? [];
    const activeId = state.playlist?.activeSourceId ?? null;
    const active = activeId === null ? undefined : sources.find((s) => s.id === activeId);

    if (sources.length === 0) return 'No sources imported yet — add one under Sources.';
    if (activeId === null) return 'No source selected — pick one under Sources.';
    if (!active) {
        return `Selected source ${activeId} is not in storage (${String(sources.length)} source(s) present). Pick one under Sources to repair.`;
    }
    if (active.needsReupload) return 'The active source needs re-uploading.';
    if (active.channelCount === 0) return 'The active source has no channels stored.';
    if (rowsInMemory === 0) return 'Source is selected but no channel rows are loaded in memory — the load may have failed or is still running.';
    return 'No inconsistency found in the list state.';
}

/** The snapshot as a plain value. Separate from publishing it so the copyable report never has to wait for a Spektrum tick to read its own write back. */
function buildSnapshot(): DebugSnapshot {
    const state = (appState ?? {}) as DebugShapedState;
    const sources = state.playlist?.sources ?? [];
    const activeId = state.playlist?.activeSourceId ?? null;
    const active = activeId === null ? undefined : sources.find((s) => s.id === activeId);
    const rowsInMemory = getRows().length;
    // Built on demand rather than read from state: the Radio list is only
    // ever built by navigating to Radio, and "how many stations does this
    // source actually produce" is the first thing worth knowing when the
    // complaint is that Radio is empty.
    let radioCount = 0;
    try {
        ensureRadioRows();
        radioCount = radioDisplayRows().length;
    } catch (error) {
        console.warn('[ThunderTV] debug snapshot could not build the radio list', error);
    }

    const snapshot: DebugSnapshot = {
        view: state.ui?.activeView ?? '(none)',
        sourceCount: sources.length,
        activeSourceId: activeId ?? '(none)',
        activeSourceResolved: active ? `${active.name} · ${String(active.channelCount)} channels` : '(not found)',
        channelCount: active?.channelCount ?? 0,
        rowsInMemory,
        liveChannels: state.live?.stats?.channels ?? 0,
        radioCount,
        storageTier: state.storage?.tier ?? '(unknown)',
        platform: state.platform?.name ?? '(unknown)',
        diagnosis: diagnose(state, rowsInMemory),
    };
    return snapshot;
}

/** Recomputed on demand rather than watched: the panel is opened by hand, and nothing should pay for this while it is closed. */
export function refreshDebugSnapshot(): void {
    replace(DEBUG_SNAPSHOT, buildSnapshot() as unknown as Record<string, unknown>);
}

/** The panel's text form, for the copy button — what a bug report should carry. */
export function debugReportText(): string {
    refreshDebugSnapshot();
    const lines = ['ThunderTV debug report', ''];
    for (const [key, value] of Object.entries(buildSnapshot())) lines.push(`${key}: ${String(value)}`);
    lines.push('', `log (${String(entries.length)} entries, ${String(errorCount)} error(s)):`);
    for (const entry of entries) lines.push(`  ${entry.at} [${entry.level}] ${entry.text}`);
    return lines.join('\n');
}

export function clearDebugLog(): void {
    entries = [];
    errorCount = 0;
    replace(DEBUG_ENTRIES, entries);
    setValue(DEBUG_ERROR_COUNT, 0);
}

export function initDebugState(): void {
    setValue(DEBUG_OPEN, false);
    setValue(DEBUG_ERROR_COUNT, errorCount);
    replace(DEBUG_ENTRIES, entries);
    refreshDebugSnapshot();
}

/** Test-only reset. @internal */
export function resetDebugForTests(): void {
    entries = [];
    errorCount = 0;
    installed = false;
    bootedAt = 0;
}
