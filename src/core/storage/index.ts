import { IdbStorage } from './idb-storage';
import { LocalStorageStorage } from './local-storage-storage';
import { MemoryStorage } from './memory-storage';
import { probeIndexedDb, probeLocalStorage } from './probe';
import type { StorageAdapter } from './storage-adapter';
import { StorageTierController, type TierControllerOptions } from './tier-controller';

/**
 * One probe, one factory, one interface (masterplan §6.2): the boot-time
 * probe's real open+write round-trip — never `window.indexedDB` presence —
 * decides the tier. `MemoryStorage` is the reference implementation; the
 * other two tiers pass the exact same test suite (Feature 04.3.10).
 */
export async function createStorage(options: TierControllerOptions = {}): Promise<StorageAdapter> {
    const initial = (await probeIndexedDb())
        ? new IdbStorage()
        : probeLocalStorage()
          ? new LocalStorageStorage()
          : new MemoryStorage();
    return new StorageTierController(initial, options);
}

export { probeIndexedDb, probeLocalStorage } from './probe';
export { IdbStorage } from './idb-storage';
export { LocalStorageStorage } from './local-storage-storage';
export { MemoryStorage } from './memory-storage';
export {
    StorageTierController,
    type DemotionReason,
    type TierControllerOptions,
} from './tier-controller';
export {
    CHUNK_ROWS,
    writeChunked,
    replaceTableChunked,
    type ChunkedWriteProgress,
    type ChunkedWriteResult,
} from './bulk';
export {
    getVersioned,
    setVersioned,
    registerMigration,
    assertMigrationChainComplete,
    type VersionedEnvelope,
    type MigrationFn,
} from './versioning';
export { encodeKey } from './keys';
export type {
    StorageAdapter,
    WriteResult,
    GetRangeOptions,
    TableName,
    StorageKey,
} from './storage-adapter';
export type {
    TableRowMap,
    PlaylistRecord,
    PlaylistType,
    ChannelRecord,
    ChannelDrm,
    ChannelDrmClearKeys,
    GroupRecord,
    EpgChannelRecord,
    EpgProgramRecord,
    EpgCatalogRecord,
    StreamHealthRecord,
    FavoriteRecord,
    RecentRecord,
} from './records';
