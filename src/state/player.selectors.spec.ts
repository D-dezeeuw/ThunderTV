import { appState, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setActiveChannel } from './player.actions';
import { registerPlayerSelectors } from './player.selectors';

describe('hasNoZapHistory (Feature 05.4.6/05.5.6)', () => {
    beforeAll(() => {
        registerPlayerSelectors();
    });

    afterEach(() => {
        resetState();
    });

    it('is true when player.zapHistory is empty', () => {
        tick();
        expect(appState['hasNoZapHistory']).toBe(true);
    });

    it('flips to false once a channel has been zapped', () => {
        setActiveChannel({ id: '1', sourceId: 's', name: 'BBC One', streamUrl: 'https://ex.test/1', logo: null, group: null });
        tick();
        expect(appState['hasNoZapHistory']).toBe(false);
    });
});
