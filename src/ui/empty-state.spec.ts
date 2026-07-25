import { appState, resetState, setValue, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { registerEmptyStateComputeds } from './empty-state';

describe('hasNoSources', () => {
    beforeAll(() => {
        registerEmptyStateComputeds();
    });

    afterEach(() => {
        resetState();
    });

    it('is true when sources.count is 0', () => {
        setValue('sources.count', 0);
        tick();
        expect(appState['hasNoSources']).toBe(true);
    });

    it('is true when sources.count becomes explicitly absent', () => {
        // Real framework sharp edge, found while writing this test: change
        // detection (isPath()) treats a delta value of `undefined` as "path
        // doesn't resolve", so setValue(path, undefined) updates appState but
        // never triggers dependent computeds to re-run. `null` doesn't have
        // this problem (null !== undefined) and the `?? 0` fallback in
        // empty-state.ts treats both as equally absent — use null here to
        // exercise the fallback for real instead of hitting the dead end.
        setValue('sources.count', 5);
        tick();
        setValue('sources.count', null);
        tick();
        expect(appState['hasNoSources']).toBe(true);
    });

    it('flips to false once sources.count is positive', () => {
        setValue('sources.count', 0);
        tick();
        expect(appState['hasNoSources']).toBe(true);

        setValue('sources.count', 3);
        tick();
        expect(appState['hasNoSources']).toBe(false);
    });
});
