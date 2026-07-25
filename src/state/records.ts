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
}
