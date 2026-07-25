/**
 * Feature detection lies: `window.indexedDB` exists in browsers where
 * `open()` then fails (private modes, some TV webviews). Never branch on
 * presence — branch on a real open + write + delete round-trip
 * (masterplan §5.1).
 */

const PROBE_DB_NAME = '__thundertv_probe__';
const PROBE_STORE_NAME = 't';
const PROBE_TIMEOUT_MS = 2_000;

export async function probeIndexedDb(): Promise<boolean> {
    try {
        return await withTimeout(probeIndexedDbUnbounded(), PROBE_TIMEOUT_MS);
    } catch {
        return false;
    }
}

async function probeIndexedDbUnbounded(): Promise<boolean> {
    if (typeof indexedDB === 'undefined') return false;

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(PROBE_DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(PROBE_STORE_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('probeIndexedDb: open failed'));
        // A blocked open (another tab holds an old version open) is treated
        // as failure per the reference — Feature 04.2.2 — rather than
        // waiting indefinitely.
        req.onblocked = () => reject(new Error('probeIndexedDb: open blocked'));
    });

    try {
        // A write must succeed too — some engines open read-only.
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(PROBE_STORE_NAME, 'readwrite');
            tx.objectStore(PROBE_STORE_NAME).put(1, 'k');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error('probeIndexedDb: write failed'));
            tx.onabort = () => reject(tx.error ?? new Error('probeIndexedDb: transaction aborted'));
        });
    } finally {
        db.close();
    }
    indexedDB.deleteDatabase(PROBE_DB_NAME);
    return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('probeIndexedDb: timed out')), ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error instanceof Error ? error : new Error(String(error)));
            },
        );
    });
}

const PROBE_LOCAL_STORAGE_KEY = '__thundertv_probe__';

/** Synchronous set/get/remove round-trip — private-mode Safari (and similar) throw a quota error on the very first write rather than reporting absence. */
export function probeLocalStorage(): boolean {
    try {
        if (typeof localStorage === 'undefined') return false;
        localStorage.setItem(PROBE_LOCAL_STORAGE_KEY, '1');
        const ok = localStorage.getItem(PROBE_LOCAL_STORAGE_KEY) === '1';
        localStorage.removeItem(PROBE_LOCAL_STORAGE_KEY);
        return ok;
    } catch {
        return false;
    }
}
