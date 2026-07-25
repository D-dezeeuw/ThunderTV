import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../../core/platform/fake-platform';
import { flushNow, pendingKeys } from '../../state';
import { setActiveChannel } from '../../state/player.actions';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY } from '../../state/player';
import { get } from '../../state/typed';
import { UI_STORAGE_NOTICE_DISMISSED } from '../../state/ui';
import { mountAfterBoot, mountTemplate } from './bind-dom';

const CHANNEL_1 = { id: '1', sourceId: 's', name: 'BBC One', streamUrl: 'https://ex.test/1', logo: null, group: null };
const CHANNEL_2 = { id: '2', sourceId: 's', name: 'ITV', streamUrl: 'https://ex.test/2', logo: null, group: null };

/**
 * The bindDOM state suite's flagship coverage (Feature 05.10.4-05.10.8) —
 * mutation-to-DOM-assertion specs at the user-semantics level, through the
 * `mountTemplate()` harness. `setActiveChannel()` is called directly (not
 * dispatched through a synthesized `data-value` click) because Spektrum's
 * own `data-value` coercion only carries primitives (bool/number/string —
 * see `player.actions.spec.ts`'s note on the same constraint); a full
 * `ActiveChannelSnapshot` is never constructible from markup. Calling the
 * exported action function directly is the sanctioned pattern (masterplan
 * §5.2.7): actions are plain, synchronous, directly callable functions —
 * `dispatch()` is for primitive-payload actions a real click could carry.
 */
describe('flagship: player/setActiveChannel renders through {{}} and data-each (Feature 05.10.4)', () => {
    it('shows the latest active channel name and both zap-history entries in order', () => {
        const mounted = mountTemplate(`
            <p data-testid="active-name">{{ player.active.name }}</p>
            <ul data-each="player.zapHistory" data-testid="zap-history">
                <li>{{ item.name }}</li>
            </ul>
        `);

        setActiveChannel(CHANNEL_1);
        tick();
        setActiveChannel(CHANNEL_2);
        tick();

        expect(mounted.query('[data-testid="active-name"]')?.textContent).toBe('ITV');
        const items = mounted.queryAll('[data-testid="zap-history"] li').map((li) => li.textContent);
        expect(items).toEqual(['ITV', 'BBC One']);

        mounted.cleanup();
    });
});

describe('flagship: conditional bindings — data-if flips on state changes (Feature 05.10.6)', () => {
    it('the storage notice attaches when the tier is partial and undismissed, detaches otherwise', () => {
        const mounted = mountTemplate('<div data-if="storageNotice.visible" data-testid="notice">Low storage</div>');

        expect(mounted.query('[data-testid="notice"]')?.style.display).toBe('none');

        setValue('storage.tier', 'partial');
        setValue(UI_STORAGE_NOTICE_DISMISSED, false);
        tick();
        expect(mounted.query('[data-testid="notice"]')?.style.display).not.toBe('none');

        setValue(UI_STORAGE_NOTICE_DISMISSED, true);
        tick();
        expect(mounted.query('[data-testid="notice"]')?.style.display).toBe('none');

        mounted.cleanup();
    });
});

describe('flagship: data-model round-trip (Feature 05.10.7)', () => {
    it('a settings.proxyTemplate input round-trips user typing into state', () => {
        const mounted = mountTemplate('<input data-model="settings.proxyTemplate" data-testid="proxy-input" />');

        const input = mounted.query<HTMLInputElement>('[data-testid="proxy-input"]');
        expect(input).not.toBeNull();
        if (!input) throw new Error('unreachable');

        input.value = 'https://proxy.example/?url={url}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        tick();

        expect(get<string>('settings.proxyTemplate')).toBe('https://proxy.example/?url={url}');

        mounted.cleanup();
    });
});

describe('flagship: persistence side effects (Feature 05.10.8)', () => {
    it('setActiveChannel dirties both player keys, and flushNow() lands them in fake storage', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            const mounted = mountTemplate('<p>{{ player.active.name }}</p>');

            setActiveChannel(CHANNEL_1);
            tick();

            expect(pendingKeys().sort()).toEqual([PLAYER_ACTIVE, PLAYER_ZAP_HISTORY].sort());

            await flushNow();

            expect(await storage.get(PLAYER_ACTIVE)).toEqual({ v: 1, data: CHANNEL_1 });
            expect(await storage.get(PLAYER_ZAP_HISTORY)).toEqual({ v: 1, data: [CHANNEL_1] });

            mounted.cleanup();
        });
    });
});

describe('flagship: rehydration renders the restored session before any heavy load (Feature 05.10.5)', () => {
    it('a stored player.active snapshot renders in the mounted template via mountAfterBoot()', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.set(PLAYER_ACTIVE, { v: 1, data: CHANNEL_1 });

            const mounted = await mountAfterBoot('<p data-testid="restored">{{ player.active.name }}</p>');

            expect(mounted.query('[data-testid="restored"]')?.textContent).toBe('BBC One');

            mounted.cleanup();
        });
    });
});
