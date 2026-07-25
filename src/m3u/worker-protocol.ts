import type { ChannelRow, GroupMeta } from './types';

/**
 * The typed, chunked worker protocol (Feature 06.4.1, MASTERPLAN.md §5.10/
 * §6.9) — imported by both `parser.worker.ts` and `parser-client.ts` so the
 * compiler enforces the contract on both sides of the `postMessage`
 * boundary. One giant message would freeze the main thread on a 100k-row
 * playlist; chunking is the fix.
 */

/**
 * Single source of truth for chunk size (Feature 06.4.2) — referenced by
 * storage writes and the Phase 07 import pipeline too.
 *
 * Decision note (Feature 06.10.7): `npm run bench:m3u`'s same-thread
 * Vitest simulation showed total CPU cost barely moving across 1 000 /
 * 5 000 / 10 000 candidates (~190–220 ms either way — chunk size doesn't
 * change how much `mapItemToChannelRow` work happens, only how it's
 * sliced) and put every candidate's longest single mapping slice under the
 * 50 ms longtask budget. That measurement was misleading: it only counted
 * mapping cost, not the real per-chunk cost on the *receiving* side —
 * structured-cloning the incoming message plus `MemoryStorage.bulkPut`'s
 * per-row `structuredClone` (Feature 04.3) — which only a real worker/main-
 * thread boundary pays for. A one-off scripted Playwright/Chromium run
 * against a real bundled build (`vite preview`, not dev, per 06.10.9's own
 * logic) with `PerformanceObserver('longtask')` measured the real number:
 * at 5 000, every chunk-receive produced a 50–180 ms longtask (over
 * budget); at 2 000, occasional 52–62 ms stragglers; at 1 000, zero
 * longtasks during chunk receive across four repeated runs — only the
 * one-time worker-instantiation task at page load remained (unrelated to
 * CHUNK, see Feature 06.10.5's tracker entry). 1 000 is the real answer,
 * not 5 000 — 100 messages for a 100 k playlist is still nowhere near
 * "flooding." The underlying per-row `structuredClone` cost in
 * `MemoryStorage`/`IdbStorage` is the real lever for headroom above this;
 * Phase 26 (Performance Hardening) owns tuning that with its own scripted
 * Playwright measurement infrastructure.
 */
export const CHUNK = 1_000;

export interface WorkerParseIn {
    type: 'parse';
    text: string;
    sourceId: string;
}

export type WorkerIn = WorkerParseIn;

/** Emitted every `CHUNK` input items processed — ~20 messages for a 100k-row playlist, not a flood (Feature 06.4.3). */
export interface WorkerProgressOut {
    type: 'progress';
    parsed: number;
}

/** A slice of ≤ `CHUNK` mapped rows; `done: true` marks the final slice, per §5.10 (Feature 06.4.4). */
export interface WorkerChunkOut {
    type: 'chunk';
    rows: ChannelRow[];
    done: boolean;
}

/** Closes every parse — the counts Phase 07's result summary consumes (Feature 06.4.5). */
export interface WorkerSummaryOut {
    type: 'summary';
    total: number;
    groups: GroupMeta[];
    radioCount: number;
    drmCount: number;
    skipped: number;
}

/** The worker never dies silently (Feature 06.3.2) — every failure path answers with this instead of an unhandled rejection/thrown error. */
export interface WorkerErrorOut {
    type: 'error';
    message: string;
}

export type WorkerOut = WorkerProgressOut | WorkerChunkOut | WorkerSummaryOut | WorkerErrorOut;
