import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeIndexedDb, probeLocalStorage } from './probe';

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

describe('probeIndexedDb', () => {
    it('resolves false when indexedDB is undefined', async () => {
        vi.stubGlobal('indexedDB', undefined);
        expect(await probeIndexedDb()).toBe(false);
    });

    it('resolves false when open() errors', async () => {
        vi.stubGlobal('indexedDB', {
            open: () => {
                const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, error: new Error('boom') };
                queueMicrotask(() => (req as { onerror: (() => void) | null }).onerror?.());
                return req;
            },
        });
        expect(await probeIndexedDb()).toBe(false);
    });

    it('resolves false on onblocked', async () => {
        vi.stubGlobal('indexedDB', {
            open: () => {
                const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
                queueMicrotask(() => (req as { onblocked: (() => void) | null }).onblocked?.());
                return req;
            },
        });
        expect(await probeIndexedDb()).toBe(false);
    });

    it('resolves false when the write transaction fails after a successful open (read-only engine)', async () => {
        vi.stubGlobal('indexedDB', {
            open: () => {
                const db = {
                    createObjectStore: () => undefined,
                    transaction: () => {
                        const tx = { oncomplete: null, onerror: null, onabort: null, error: new Error('read-only') };
                        queueMicrotask(() => (tx as { onerror: (() => void) | null }).onerror?.());
                        return { objectStore: () => ({ put: () => undefined }), ...tx };
                    },
                    close: () => undefined,
                };
                const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: db };
                queueMicrotask(() => {
                    (req as { onupgradeneeded: (() => void) | null }).onupgradeneeded?.();
                    (req as { onsuccess: (() => void) | null }).onsuccess?.();
                });
                return req;
            },
            deleteDatabase: () => undefined,
        });
        expect(await probeIndexedDb()).toBe(false);
    });

    it('resolves true on a real open+write+delete round-trip (fake-indexeddb)', async () => {
        const { IDBFactory } = await import('fake-indexeddb');
        vi.stubGlobal('indexedDB', new IDBFactory());
        expect(await probeIndexedDb()).toBe(true);
    });

    it('times out rather than hanging boot when open() never settles', async () => {
        vi.stubGlobal('indexedDB', { open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null }) });
        expect(await probeIndexedDb()).toBe(false);
    }, 3_000);
});

describe('probeLocalStorage', () => {
    it('resolves true on a real environment', () => {
        expect(probeLocalStorage()).toBe(true);
    });

    it('resolves false when localStorage is undefined', () => {
        vi.stubGlobal('localStorage', undefined);
        expect(probeLocalStorage()).toBe(false);
    });

    it('resolves false when setItem throws (private-mode quota)', () => {
        vi.stubGlobal('localStorage', {
            setItem: () => {
                throw new DOMException('quota', 'QuotaExceededError');
            },
            getItem: () => null,
            removeItem: () => undefined,
        });
        expect(probeLocalStorage()).toBe(false);
    });
});
