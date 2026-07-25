/**
 * Type-only placeholder for the tiered storage contract (masterplan §5).
 * Declared here — not in `./index.ts` — so `PlatformAdapter` (Phase 03)
 * compiles against a real shape before Phase 04 exists. This minimal
 * key/value shape is deliberately provisional: Phase 04 owns the actual
 * design (tier selection, chunked bulk writes, the IndexedDB store layout)
 * and may extend or replace it. Nothing besides `PlatformAdapter` and the
 * Phase 03 in-memory stub/`FakePlatform` should depend on this shape yet.
 */
export interface StorageAdapter {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}
