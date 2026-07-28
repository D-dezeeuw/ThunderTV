import { appState, resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { debugReadState, initState, rehydrateState, seedStrings } from './index';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY } from './player';
import { UI_DENSITY } from './ui';

describe('initState() (Feature 05.1.8)', () => {
    afterEach(() => {
        resetState();
    });

    it('seeds every module default before anything else runs', () => {
        initState();
        tick();

        expect(debugReadState(PLAYER_ACTIVE)).toBeNull();
        expect(debugReadState(PLAYER_ZAP_HISTORY)).toEqual([]);
        expect(debugReadState(UI_DENSITY)).toBe('comfortable');
    });
});

describe('rehydrateState() (Feature 05.4.2-05.4.4)', () => {
    afterEach(() => {
        resetState();
    });

    it('overwrites a default with a valid stored envelope for a persisted key', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.set(UI_DENSITY, { v: 1, data: 'compact' });

            initState();
            tick();
            await rehydrateState();
            tick();

            expect(debugReadState(UI_DENSITY)).toBe('compact');
        });
    });

    it('leaves the seeded default untouched when storage has no value for a persisted key', async () => {
        await withFakePlatform({}, async () => {
            initState();
            tick();
            await rehydrateState();
            tick();

            // Nothing was ever stored for UI_DENSITY — the getMany "hole"
            // contract (04.3.8) must not clobber the default with undefined.
            expect(debugReadState(UI_DENSITY)).toBe('comfortable');
        });
    });

    it('skips a corrupt (non-envelope) blob and keeps the default — a bad snapshot must never brick boot', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.set(UI_DENSITY, 'not-an-envelope');

            initState();
            tick();
            await rehydrateState();
            tick();

            expect(debugReadState(UI_DENSITY)).toBe('comfortable');
        });
    });

    it('runs seed-then-overwrite in order — a value present only after initState() is not lost', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.set(PLAYER_ACTIVE, {
                v: 1,
                data: { id: '1', sourceId: 's', name: 'N', streamUrl: 'u', logo: null, group: null },
            });

            initState();
            tick();
            expect(debugReadState(PLAYER_ACTIVE)).toBeNull();

            await rehydrateState();
            tick();
            expect((debugReadState(PLAYER_ACTIVE) as { id?: string } | null)?.id).toBe('1');
        });
    });
});

describe('seedStrings() (Feature 05.2.5)', () => {
    afterEach(() => {
        resetState();
    });

    it('mirrors the static strings module into Spektrum state for :attr/{{}} bindings', async () => {
        await seedStrings();
        tick();
        expect((appState['strings'] as { appName?: string } | undefined)?.appName).toBe('ThunderTV');
    });
});
