import { getPlatform } from '../core/platform';

/**
 * VOD/series catalog persistence — small-keyed `get`/`set` writes, gated on
 * the storage tier being `'full'`.
 *
 * **Decision (documented per this phase's mandate, since it deviates from
 * the "bulk table" pattern `channels`/`groups`/`epgPrograms` use):**
 * `src/core/storage/records.ts`'s `TableName` union has no bulk table
 * shaped for a VOD/series catalog, and adding one would mean touching
 * `src/core/storage/**`, outside this phase's `src/state/`-only mandate.
 * Catalog payloads persist instead through the small-keyed `get`/`set`
 * surface (`src/core/storage/README.md`'s "two surfaces"), one key per
 * category and one key per cached detail payload — mirroring
 * `epg-load.ts`'s `XMLTV_LAST_FETCHED_KEY` precedent (a plain storage key
 * outside the bulk-table system) rather than one giant blob per catalog, so
 * a single write never has to serialize the *whole* provider catalog at
 * once. Persisted **only** on the `'full'` tier — `'partial'`
 * (`localStorage`) and `'none'` stay session-memory-only (`catalog-
 * memory.ts` alone): a multi-thousand-item catalog is exactly the kind of
 * payload a quota-constrained tier should never be asked to hold, and a
 * failed write there would otherwise trigger the tier controller's
 * (permanent, session-scoped) demotion for a cache that is allowed to just
 * not persist.
 */

export interface StoredCategories {
    fetchedAt: number;
    categories: readonly { id: string; name: string }[];
}

export interface StoredItems<TItem> {
    fetchedAt: number;
    items: readonly TItem[];
}

export interface StoredDetail<TDetail> {
    fetchedAt: number;
    data: TDetail;
}

function tierIsFull(): boolean {
    return getPlatform().storage.tier === 'full';
}

export async function loadStoredCategories(prefix: string): Promise<StoredCategories | undefined> {
    if (!tierIsFull()) return undefined;
    return getPlatform().storage.get<StoredCategories>(`${prefix}.catalog.categories`);
}

export async function saveStoredCategories(prefix: string, payload: StoredCategories): Promise<void> {
    if (!tierIsFull()) return;
    await getPlatform().storage.set(`${prefix}.catalog.categories`, payload);
}

export async function loadStoredItems<TItem>(prefix: string, categoryId: string): Promise<StoredItems<TItem> | undefined> {
    if (!tierIsFull()) return undefined;
    return getPlatform().storage.get<StoredItems<TItem>>(`${prefix}.catalog.items.${categoryId}`);
}

export async function saveStoredItems<TItem>(prefix: string, categoryId: string, payload: StoredItems<TItem>): Promise<void> {
    if (!tierIsFull()) return;
    await getPlatform().storage.set(`${prefix}.catalog.items.${categoryId}`, payload);
}

export async function loadStoredDetail<TDetail>(prefix: string, id: number): Promise<StoredDetail<TDetail> | undefined> {
    if (!tierIsFull()) return undefined;
    return getPlatform().storage.get<StoredDetail<TDetail>>(`${prefix}.catalog.detail.${String(id)}`);
}

export async function saveStoredDetail<TDetail>(prefix: string, id: number, payload: StoredDetail<TDetail>): Promise<void> {
    if (!tierIsFull()) return;
    await getPlatform().storage.set(`${prefix}.catalog.detail.${String(id)}`, payload);
}
