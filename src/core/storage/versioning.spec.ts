import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from './memory-storage';
import { assertMigrationChainComplete, getVersioned, registerMigration, setVersioned } from './versioning';

describe('versioning', () => {
    it('reads a value already at the current version without migrating', async () => {
        const storage = new MemoryStorage();
        await setVersioned(storage, 'k', 1, { name: 'a' });
        expect(await getVersioned(storage, 'settings-family', 'k', 1)).toEqual({ name: 'a' });
    });

    it('migrates v1 -> v3 through two hooks, in order, and writes back once', async () => {
        const family = `family-${String(Math.floor(Math.random() * 1e9))}`;
        registerMigration(family, 1, 2, (old: unknown) => ({ ...(old as object), addedInV2: true }));
        registerMigration(family, 2, 3, (old: unknown) => ({ ...(old as object), addedInV3: true }));
        assertMigrationChainComplete(family, 1, 3);

        const storage = new MemoryStorage();
        await setVersioned(storage, 'k', 1, { name: 'a' });

        const migrated = await getVersioned<{ name: string; addedInV2: boolean; addedInV3: boolean }>(
            storage,
            family,
            'k',
            3,
        );
        expect(migrated).toEqual({ name: 'a', addedInV2: true, addedInV3: true });

        // Write-back happened — a second read at v3 finds it already there, no re-migration needed.
        const raw = await storage.get<{ v: number }>('k');
        expect(raw?.v).toBe(3);
    });

    it('a missing intermediate hook surfaces at registry time, not read time (Feature 04.9.8)', () => {
        const family = `gap-${String(Math.floor(Math.random() * 1e9))}`;
        registerMigration(family, 1, 2, (old) => old);
        // No 2->3 hook registered.
        expect(() => assertMigrationChainComplete(family, 1, 3)).toThrow(/no migration registered/);
    });

    it('a read hitting an unregistered gap resolves undefined rather than throwing (Feature 04.9.4)', async () => {
        const family = `gap-read-${String(Math.floor(Math.random() * 1e9))}`;
        registerMigration(family, 1, 2, (old) => old);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const storage = new MemoryStorage();
        await setVersioned(storage, 'k', 1, { name: 'a' });

        expect(await getVersioned(storage, family, 'k', 3)).toBeUndefined();
        warnSpy.mockRestore();
    });

    it('a version newer than the current build resolves undefined (downgraded app)', async () => {
        const storage = new MemoryStorage();
        await setVersioned(storage, 'k', 5, { name: 'a' });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(await getVersioned(storage, 'any-family', 'k', 1)).toBeUndefined();
        warnSpy.mockRestore();
    });

    it('a corrupt (non-envelope) stored value resolves undefined', async () => {
        const storage = new MemoryStorage();
        await storage.set('k', 'just a plain string, not an envelope');
        expect(await getVersioned(storage, 'any-family', 'k', 1)).toBeUndefined();
    });

    it('never logs stored data — only the key family and version numbers', async () => {
        const family = `secret-${String(Math.floor(Math.random() * 1e9))}`;
        const storage = new MemoryStorage();
        await setVersioned(storage, 'k', 5, { username: 'me', password: 'super-secret' });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await getVersioned(storage, family, 'k', 1);

        for (const call of warnSpy.mock.calls.flat()) {
            expect(String(call)).not.toContain('super-secret');
        }
        warnSpy.mockRestore();
    });
});
