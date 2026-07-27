import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
import { LIVE_STATS } from './live';
import { playVariantById, publishVariantsFor } from './live.actions';
import { PLAYER_ACTIVE, PLAYER_ACTIVE_VARIANT_ID, PLAYER_VARIANTS } from './player';
import { setActiveChannel } from './player.actions';
import type { ActiveChannelSnapshot } from './records';
import { setLiveCountry, toggleSetting } from './settings.actions';
import { SETTINGS_LIVE_COUNTRY, SETTINGS_LIVE_DROP_JUNK, SETTINGS_NAV_CATEGORIES } from './settings';
import { get } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

/**
 * Binding-level coverage for the Live view's new wiring. These assert the
 * pieces that pure unit tests over `grouping.ts` cannot reach: that the
 * markup's `data-if`/`:checked`/`data-each` expressions resolve against the
 * real computeds and actions.
 */

const NPO: ActiveChannelSnapshot = {
    id: 'a',
    sourceId: 's',
    name: 'NPO 1',
    streamUrl: 'http://x/a.ts',
    logo: null,
    group: null,
};

describe('rail visibility (Settings → Navigation)', () => {
    it('hides a rail button when its toggle goes off, and keeps it while its own view is open', () => {
        const mounted = mountTemplate(`
            <button data-if="rail.categories.visible" data-testid="rail-categories">Categories</button>
        `);
        const button = (): HTMLElement | null => mounted.query('[data-testid="rail-categories"]');

        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        expect(button()?.style.display).toBe('');

        toggleSetting('nav.categories');
        tick();
        expect(get<boolean>(SETTINGS_NAV_CATEGORIES)).toBe(false);
        expect(button()?.style.display).toBe('none');

        // Standing in the view you just hid must not erase the only visible
        // marker of where you are.
        setValue(UI_ACTIVE_VIEW, 'categories');
        tick();
        expect(button()?.style.display).toBe('');

        mounted.cleanup();
    });

    it('reflects the stored flag back into the settings checkbox', () => {
        const mounted = mountTemplate(`
            <input type="checkbox" :checked="settings.liveDropJunk" data-testid="drop-junk" />
        `);
        const box = mounted.query<HTMLInputElement>('[data-testid="drop-junk"]');
        tick();
        expect(box?.checked).toBe(true);

        toggleSetting('liveDropJunk');
        tick();
        expect(get<boolean>(SETTINGS_LIVE_DROP_JUNK)).toBe(false);
        expect(box?.checked).toBe(false);

        mounted.cleanup();
    });

    it('ignores a data-setting token that is not on the allowlist', () => {
        // Mount for the seeded-state side effect: the allowlist must be
        // proven against a real store, not an empty one.
        const mounted = mountTemplate('<div></div>');

        toggleSetting('player.active');
        toggleSetting(undefined);
        tick();

        expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)).toBeNull();
        mounted.cleanup();
    });
});

describe('live filter settings', () => {
    it('normalizes the country token and keeps the empty "all countries" choice', () => {
        const mounted = mountTemplate('<div></div>');

        setLiveCountry(' be ');
        tick();
        expect(get<string>(SETTINGS_LIVE_COUNTRY)).toBe('BE');

        // `''` is meaningful, not "unset": it disables country filtering
        // while leaving grouping on.
        setLiveCountry('');
        tick();
        expect(get<string>(SETTINGS_LIVE_COUNTRY)).toBe('');

        mounted.cleanup();
    });
});

describe('live stats readout', () => {
    it('sums the hidden reasons into one count and flags a filter that removed everything', () => {
        const mounted = mountTemplate(`
            <p data-testid="hidden">{{ liveHiddenCount }}</p>
            <div data-if="liveFilteredEverything" data-testid="empty"></div>
        `);

        setValue(UI_ACTIVE_VIEW, 'live');
        setValue(LIVE_STATS, {
            inputRows: 100,
            channels: 0,
            hiddenByCountry: 60,
            hiddenAsJunk: 30,
            hiddenAsUnknown: 10,
            collapsed: 0,
        });
        tick();

        expect(mounted.query('[data-testid="hidden"]')?.textContent).toBe('100');
        expect(mounted.query('[data-testid="empty"]')?.style.display).toBe('');

        // A source that genuinely has no channels is a different failure —
        // the Live-specific empty state must not claim the filter did it.
        setValue(LIVE_STATS, { inputRows: 0, channels: 0, hiddenByCountry: 0, hiddenAsJunk: 0, hiddenAsUnknown: 0, collapsed: 0 });
        tick();
        expect(mounted.query('[data-testid="empty"]')?.style.display).toBe('none');

        mounted.cleanup();
    });
});

describe('variant switcher', () => {
    it('renders a chip per feed, marks the playing one, and switches the stream on click', () => {
        const mounted = mountTemplate(`
            <div data-if="hasVariants" data-testid="strip">
                <div data-each="player.variants" data-action="click" data-fn="live/playVariant">
                    <button
                        :class="{ 'is-active': item.id === player.activeVariantId }"
                        :data-variant-id="item.id"
                        data-testid="chip"
                    >{{ item.label }}</button>
                </div>
            </div>
        `);

        setActiveChannel(NPO);
        setValue(PLAYER_VARIANTS, [
            { id: 'a', url: 'http://x/a.ts', label: 'FHD', quality: 'FHD', isRecording: false, provider: null },
            { id: 'b', url: 'http://x/b.ts', label: 'HD · catch-up', quality: 'HD', isRecording: true, provider: null },
        ]);
        setValue(PLAYER_ACTIVE_VARIANT_ID, 'a');
        tick();

        expect(mounted.query('[data-testid="strip"]')?.style.display).toBe('');
        const chips = mounted.queryAll('[data-testid="chip"]');
        expect(chips.map((c) => c.textContent)).toEqual(['FHD', 'HD · catch-up']);
        expect(chips[0]?.classList.contains('is-active')).toBe(true);

        // Click the catch-up chip through the real delegated handler.
        chips[1]?.click();
        tick();

        expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.streamUrl).toBe('http://x/b.ts');
        // Identity stays the channel's, not the variant's, so the list
        // highlight and favorites keep pointing at one channel.
        expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.id).toBe('a');
        expect(get<string | null>(PLAYER_ACTIVE_VARIANT_ID)).toBe('b');

        mounted.cleanup();
    });

    it('stays hidden for a channel with only one feed', () => {
        const mounted = mountTemplate(`<div data-if="hasVariants" data-testid="strip"></div>`);
        setValue(PLAYER_VARIANTS, [
            { id: 'a', url: 'http://x/a.ts', label: 'HD', quality: 'HD', isRecording: false, provider: null },
        ]);
        tick();
        expect(mounted.query('[data-testid="strip"]')?.style.display).toBe('none');
        mounted.cleanup();
    });

    it('publishVariantsFor leaves the strip empty for a row that has no variants', () => {
        publishVariantsFor('missing-row', 'http://x/a.ts');
        tick();
        expect(get<unknown[]>(PLAYER_VARIANTS)).toEqual([]);
        expect(get<string | null>(PLAYER_ACTIVE_VARIANT_ID)).toBeNull();
    });

    it('playVariantById is a no-op for an id that is not in the current strip', () => {
        setActiveChannel(NPO);
        setValue(PLAYER_VARIANTS, []);
        tick();
        playVariantById('nope');
        tick();
        expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.streamUrl).toBe('http://x/a.ts');
    });
});
