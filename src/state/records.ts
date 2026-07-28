/**
 * Denormalized state-layer row shapes — everything needed to render a row
 * and start playback without any playlist loaded (masterplan §6.4).
 * Deliberately mirrors the storage layer's `FavoriteRecord`/`RecentRecord`
 * shape (`src/core/storage/records.ts`) field-for-field so a future
 * `favorites`/`recent` action can move a snapshot between the two without
 * reshaping it.
 */
export interface ActiveChannelSnapshot {
    id: string;
    sourceId: string;
    name: string;
    streamUrl: string;
    logo: string | null;
    group: string | null;
    /**
     * Audio-only station. Optional because it is additive over snapshots
     * already persisted without it — an entry from before this existed is
     * simply treated as television. Carried so Recents can send a station
     * back to Radio, which is the only view with a layout for one.
     */
    radio?: boolean;
    /**
     * What is playing (Phase 21's Movies/Series catalogs) — additive over
     * every snapshot built before this field existed, which all still omit
     * it and read as television, same "absent means the old default"
     * pattern as `radio` above. Never round-tripped through equality
     * against an older stored snapshot in a way that would break: existing
     * specs build snapshots without `kind` and compare them against other
     * snapshots without `kind`, so the field stays `undefined` on both
     * sides. `vod.actions.ts`'s `playVod()`/`series.actions.ts`'s
     * `playSeriesEpisode()` are the only current writers of `'vod'`/`'series'`.
     */
    kind?: 'live' | 'vod' | 'series';
}
