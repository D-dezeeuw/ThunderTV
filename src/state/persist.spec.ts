import { resetState, setValue, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPlatformForTests, setPlatform } from '../core/platform';
import { FakeDownloadAdapter, withFakePlatform } from '../core/platform/fake-platform';
import { MemoryStorage } from '../core/storage/memory-storage';
import type { StorageAdapter, WriteResult } from '../core/storage/storage-adapter';
import type { PlatformAdapter } from '../core/platform/platform-adapter';
import { flushNow, pendingKeys, persist, registerPersistOnHide, unwrapPersisted } from './persist';
import { UI_DENSITY } from './ui';

/** Wraps a real MemoryStorage, failing `setMany` on demand — explicit delegation (not a spread) since class methods live on the prototype. */
class FlakyStorage implements StorageAdapter {
    private readonly inner = new MemoryStorage();
    failNextSetMany = false;

    readonly tier = this.inner.tier;
    get = this.inner.get.bind(this.inner);
    set = this.inner.set.bind(this.inner);
    getMany = this.inner.getMany.bind(this.inner);
    delete = this.inner.delete.bind(this.inner);
    bulkPut = this.inner.bulkPut.bind(this.inner);
    getAll = this.inner.getAll.bind(this.inner);
    getRange = this.inner.getRange.bind(this.inner);
    clearTable = this.inner.clearTable.bind(this.inner);
    count = this.inner.count.bind(this.inner);
    deleteRow = this.inner.deleteRow.bind(this.inner);
    deleteByPlaylistId = this.inner.deleteByPlaylistId.bind(this.inner);

    setMany<T = unknown>(entries: [string, T][]): Promise<WriteResult> {
        if (this.failNextSetMany) {
            this.failNextSetMany = false;
            return Promise.resolve({ ok: false, reason: 'quota' });
        }
        return this.inner.setMany(entries);
    }
}

function platformWith(storage: StorageAdapter): PlatformAdapter {
    return { name: 'web', http: {} as PlatformAdapter['http'], files: {} as PlatformAdapter['files'], downloads: new FakeDownloadAdapter(), storage, capabilities: { corsUnrestricted: true, externalPlayers: false, durableStorage: storage.tier , downloads: 'none'} };
}

describe('persist() debounce (Feature 05.3.1/05.3.9)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        resetState();
        resetPlatformForTests();
        vi.useRealTimers();
    });

    it('throws in dev for a key the registry does not mark persisted', () => {
        expect(() => persist('ui.activeView')).toThrow(/not marked persisted/);
    });

    it('does not flush before the 500ms debounce window elapses', async () => {
        const storage = new MemoryStorage();
        setPlatform(platformWith(storage));
        setValue(UI_DENSITY, 'compact');
        tick();

        persist(UI_DENSITY);
        vi.advanceTimersByTime(499);
        await Promise.resolve();

        expect(await storage.get(UI_DENSITY)).toBeUndefined();
    });

    it('flushes exactly one setMany after 500ms', async () => {
        const storage = new MemoryStorage();
        setPlatform(platformWith(storage));
        setValue(UI_DENSITY, 'compact');
        tick();

        persist(UI_DENSITY);
        vi.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();

        expect(pendingKeys()).toHaveLength(0);
        expect(await storage.get(UI_DENSITY)).toEqual({ v: 1, data: 'compact' });
    });

    it('resets the timer on repeated dirtying within the window instead of flushing twice', async () => {
        const storage = new MemoryStorage();
        setPlatform(platformWith(storage));
        setValue(UI_DENSITY, 'compact');
        tick();

        persist(UI_DENSITY);
        vi.advanceTimersByTime(300);
        persist(UI_DENSITY);
        vi.advanceTimersByTime(300);
        // 600ms of wall time has passed but the window kept resetting —
        // only 300ms has elapsed since the last persist() call.
        expect(pendingKeys()).toContain(UI_DENSITY);

        vi.advanceTimersByTime(200);
        await Promise.resolve();
        await Promise.resolve();
        expect(pendingKeys()).toHaveLength(0);
        expect(await storage.get(UI_DENSITY)).toEqual({ v: 1, data: 'compact' });
    });

    it('coalesces multiple dirtied keys within one window into a single setMany carrying each key once with its latest value', async () => {
        const storage = new MemoryStorage();
        setPlatform(platformWith(storage));
        setValue(UI_DENSITY, 'compact');
        tick();

        persist(UI_DENSITY);
        setValue(UI_DENSITY, 'comfortable');
        tick();
        persist(UI_DENSITY);

        vi.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();

        expect(pendingKeys()).toHaveLength(0);
        expect(await storage.get(UI_DENSITY)).toEqual({ v: 1, data: 'comfortable' });
    });
});

describe('flushNow() failure requeue (Feature 05.3.4)', () => {
    afterEach(() => {
        resetState();
        resetPlatformForTests();
    });

    it('re-marks a failed batch dirty instead of dropping it', async () => {
        const storage = new FlakyStorage();
        setPlatform(platformWith(storage));
        setValue(UI_DENSITY, 'compact');
        tick();

        storage.failNextSetMany = true;
        persist(UI_DENSITY);
        await flushNow();

        expect(pendingKeys()).toContain(UI_DENSITY);
        expect(await storage.get(UI_DENSITY)).toBeUndefined();

        await flushNow();
        expect(pendingKeys()).toHaveLength(0);
        expect(await storage.get(UI_DENSITY)).toEqual({ v: 1, data: 'compact' });
    });
});

describe('flushNow() / pendingKeys() (Feature 05.3.8)', () => {
    afterEach(() => {
        resetState();
        resetPlatformForTests();
    });

    it('flushNow() is a no-op when nothing is dirty', async () => {
        await expect(flushNow()).resolves.toBeUndefined();
    });
});

describe('registerPersistOnHide (Feature 05.3.5)', () => {
    afterEach(() => {
        resetState();
        resetPlatformForTests();
    });

    it('flushes pending keys on visibilitychange to hidden', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            setValue(UI_DENSITY, 'compact');
            tick();
            persist(UI_DENSITY);

            const unregister = registerPersistOnHide();
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
            await Promise.resolve();
            await Promise.resolve();

            expect(await storage.get(UI_DENSITY)).toEqual({ v: 1, data: 'compact' });
            unregister();
        });
    });

    it('flushes pending keys on pagehide', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            setValue(UI_DENSITY, 'comfortable');
            tick();
            persist(UI_DENSITY);

            const unregister = registerPersistOnHide();
            window.dispatchEvent(new Event('pagehide'));
            await Promise.resolve();
            await Promise.resolve();

            expect(await storage.get(UI_DENSITY)).toEqual({ v: 1, data: 'comfortable' });
            unregister();
        });
    });
});

describe('unwrapPersisted (Feature 05.4.4)', () => {
    it('returns the unwrapped data for a valid, current-version envelope', () => {
        expect(unwrapPersisted(UI_DENSITY, { v: 1, data: 'compact' })).toBe('compact');
    });

    it('returns undefined for a malformed (non-envelope) blob without throwing', () => {
        expect(unwrapPersisted(UI_DENSITY, 'not-an-envelope')).toBeUndefined();
        expect(unwrapPersisted(UI_DENSITY, null)).toBeUndefined();
        expect(unwrapPersisted(UI_DENSITY, { data: 'compact' })).toBeUndefined();
    });

    it('returns undefined for a version mismatch', () => {
        expect(unwrapPersisted(UI_DENSITY, { v: 2, data: 'compact' })).toBeUndefined();
    });
});
