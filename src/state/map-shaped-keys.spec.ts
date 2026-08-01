import { describe, expect, it } from 'vitest';
// Imported before any state module on purpose: `registry-keys.ts` takes each
// key's name from the module that owns it, so loading an owner first can
// leave those names uninitialized while the table is being built. Reaching
// the registry directly is the one order that always sees it whole.
import { KEY_REGISTRY } from './registry';
import { MAP_SHAPED_KEYS } from './map-shaped-keys';

/**
 * `MAP_SHAPED_KEYS` is a literal set because the write-time check runs
 * inside `typed.ts` and must not depend on module load order (see that
 * module's comment). `KEY_REGISTRY` carries the same fact as documentation.
 * This is the gate that stops the two from drifting.
 */
describe('map-shaped keys (UPGRADES U11)', () => {
    it('matches the registry entries marked mapShaped, exactly', () => {
        const registered = Object.entries(KEY_REGISTRY)
            .filter(([, meta]) => meta.mapShaped === true)
            .map(([key]) => key)
            .sort();

        expect([...MAP_SHAPED_KEYS].sort()).toEqual(registered);
    });

    it('names only keys that are actually registered', () => {
        for (const key of MAP_SHAPED_KEYS) expect(KEY_REGISTRY[key]).toBeDefined();
    });
});
