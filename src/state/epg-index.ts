import type { EpgProgramRecord } from '../core/storage';
import { nowNext, progressPercent, type NowNext } from '../epg/now-next';

/**
 * The channel-list row enricher's data source: every stored programme,
 * bucketed by channel id and sorted by start.
 *
 * Module memory, never Spektrum state — same rule as
 * `m3u/channel-memory.ts`'s row array (state/README.md's "Bulk-data bypass
 * rules"). A full country's programme set is tens of thousands of rows,
 * three orders of magnitude past `MAX_RECORDED_COLLECTION`, and the row
 * enricher reads it synchronously on every windowed republish — it cannot
 * be an `await`ed storage read, and it must not be a recorded mutation.
 *
 * `guide-load.ts` populates this from the same `getAll('epgPrograms')` it
 * already performs for the Guide grid, so this index costs no extra read.
 */
let byChannel: Map<string, EpgProgramRecord[]> = new Map();

export function setEpgProgramIndex(index: Map<string, EpgProgramRecord[]>): void {
    byChannel = index;
}

export function clearEpgProgramIndex(): void {
    byChannel = new Map();
}

/** True once any programmes are indexed — lets a caller skip per-row work entirely on a device with no EPG data yet. */
export function hasEpgPrograms(): boolean {
    return byChannel.size > 0;
}

export function programsForChannel(channelId: string): readonly EpgProgramRecord[] {
    return byChannel.get(channelId) ?? [];
}

export interface RowEpgSnapshot {
    nowTitle: string | null;
    nextTitle: string | null;
    /** 0–100 through the current programme; 0 when nothing is airing. */
    progress: number;
}

/**
 * One row's EPG line. `channelId` is `ChannelRow.epgId` — the Phase 31
 * matcher's output — so a channel the catalog never matched simply has no
 * id to look up and gets `null` here, rather than a wrong guess.
 */
export function rowEpgSnapshot(channelId: string | null | undefined, nowMs: number): RowEpgSnapshot | null {
    if (!channelId) return null;
    const programs = byChannel.get(channelId);
    if (!programs || programs.length === 0) return null;

    const found: NowNext<EpgProgramRecord> = nowNext(programs, nowMs);
    if (!found.now && !found.next) return null;

    return {
        nowTitle: found.now?.title ?? null,
        nextTitle: found.next?.title ?? null,
        // Rounded to a whole percent, which is the most the progress bar can
        // possibly render (`index.html` binds it straight to a `width: %`).
        // The raw value is a float off `Date.now()`, so it changed on every
        // single scroll frame — 50.00083 then 50.00167 — which made the row
        // re-derive, the published array churn identities, and the keyless
        // `data-each` rebuild every row. Invisible precision was driving a
        // visible bug; see `list-publish.stability.spec.ts`.
        progress: found.now ? Math.round(progressPercent(found.now.start, found.now.stop, nowMs)) : 0,
    };
}
