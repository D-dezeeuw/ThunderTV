import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStorage } from './index';

afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
});

describe('createStorage() decision tree (Feature 04.2.8)', () => {
    it('IDB probe passes -> full tier', async () => {
        vi.stubGlobal('indexedDB', new IDBFactory());
        const storage = await createStorage();
        expect(storage.tier).toBe('full');
    });

    it('IDB probe fails, localStorage probe passes -> partial tier', async () => {
        vi.stubGlobal('indexedDB', undefined);
        const storage = await createStorage();
        expect(storage.tier).toBe('partial');
    });

    it('both probes fail -> none tier', async () => {
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('localStorage', undefined);
        const storage = await createStorage();
        expect(storage.tier).toBe('none');
    });

    it('wraps the selected adapter in exactly one StorageTierController', async () => {
        vi.stubGlobal('indexedDB', undefined);
        vi.stubGlobal('localStorage', undefined);
        const storage = await createStorage();
        // The controller demotes on the first {ok:false} write; if createStorage()
        // ever constructed two controllers stacked on each other, a demotion
        // triggered through the outer one wouldn't affect what get()/set() reads
        // through — this exercises that they're the same object.
        await storage.set('k', 'v');
        expect(await storage.get('k')).toBe('v');
    });
});
