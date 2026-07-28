import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
import { seedStrings } from './index';
import { LIVE_STATS, RADIO_COUNT } from './live';
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

describe('radio empty state', () => {
    it('explains an empty Radio list instead of rendering a blank box', () => {
        const mounted = mountTemplate(`
            <div data-if="radioIsEmpty" data-testid="radio-empty"></div>
            <div data-if="!radioIsEmpty" data-testid="radio-list"></div>
        `);
        const empty = (): string | undefined => mounted.query('[data-testid="radio-empty"]')?.style.display;

        setValue('activeSource', { id: 's', name: 'Provider', channelCount: 26232 });
        setValue(RADIO_COUNT, 0);
        setValue(UI_ACTIVE_VIEW, 'radio');
        tick();
        expect(empty()).toBe('');
        expect(mounted.query('[data-testid="radio-list"]')?.style.display).toBe('none');

        // Stations found: back to the list, no notice.
        setValue(RADIO_COUNT, 131);
        tick();
        expect(empty()).toBe('none');

        // The notice belongs to Radio alone — Live has its own.
        setValue(RADIO_COUNT, 0);
        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        expect(empty()).toBe('none');

        // And a source with nothing in it at all is a different failure,
        // already covered by the generic "no channels" line.
        setValue('activeSource', { id: 's', name: 'Provider', channelCount: 0 });
        setValue(UI_ACTIVE_VIEW, 'radio');
        tick();
        expect(empty()).toBe('none');

        mounted.cleanup();
    });
});

describe('variant switcher', () => {
    it('renders an icon chip per feed, marks the playing one, and switches the stream on click', () => {
        const mounted = mountTemplate(`
            <div data-if="hasVariants" data-testid="strip">
                <div data-each="player.variants" data-action="click" data-fn="live/playVariant">
                    <button
                        :class="{ 'is-active': item.id === player.activeVariantId }"
                        :aria-label="item.label"
                        :data-tip="item.label"
                        :data-variant-id="item.id"
                        data-testid="chip"
                    >
                        <span data-testid="bars" data-if="item.tier">
                            <i :class="{ on: item.tier >= 1 }"></i>
                            <i :class="{ on: item.tier >= 2 }"></i>
                            <i :class="{ on: item.tier >= 3 }"></i>
                            <i :class="{ on: item.tier >= 4 }"></i>
                        </span>
                        <span data-testid="catchup" data-if="item.isRecording"></span>
                        <span data-testid="caption" data-if="item.quality">{{ item.quality }}</span>
                        <span data-testid="caption-alt" data-if="!item.quality">{{ strings.live.variants.alt }}</span>
                    </button>
                </div>
                <span data-testid="current">{{ activeVariantLabel }}</span>
            </div>
        `);

        setActiveChannel(NPO);
        setValue(PLAYER_VARIANTS, [
            { id: 'a', url: 'http://x/a.ts', label: 'FHD', quality: 'FHD', isRecording: false, provider: null, tier: 3 },
            { id: 'b', url: 'http://x/b.ts', label: 'HD · catch-up', quality: 'HD', isRecording: true, provider: null, tier: 2 },
        ]);
        setValue(PLAYER_ACTIVE_VARIANT_ID, 'a');
        tick();

        expect(mounted.query('[data-testid="strip"]')?.style.display).toBe('');
        const chips = mounted.queryAll('[data-testid="chip"]');
        // The label is the accessible name now, not the visible text — the
        // long "FHD · NEDERLAND ULTRA" forms are what overran the pane.
        expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['FHD', 'HD · catch-up']);
        expect(chips[0]?.classList.contains('is-active')).toBe(true);

        // Tier reads as lit bars: FHD lights three of four, HD two.
        const lit = (chip: HTMLElement | undefined): number => chip?.querySelectorAll('i.on').length ?? -1;
        expect(lit(chips[0])).toBe(3);
        expect(lit(chips[1])).toBe(2);

        // Catch-up gets its own glyph, and only the recording has it.
        const catchup = (chip: HTMLElement | undefined): string | undefined =>
            chip?.querySelector<HTMLElement>('[data-testid="catchup"]')?.style.display;
        expect(catchup(chips[0])).toBe('none');
        expect(catchup(chips[1])).toBe('');

        // The playing feed stays spelled out, so the current choice is
        // never only an icon.
        expect(mounted.query('[data-testid="current"]')?.textContent).toBe('FHD');

        // The quality code is an always-visible caption now, not something
        // that only shows up on hover — icons alone read as noise.
        const caption = (chip: HTMLElement | undefined): string | undefined =>
            chip?.querySelector<HTMLElement>('[data-testid="caption"]')?.textContent;
        expect(caption(chips[0])).toBe('FHD');
        expect(caption(chips[1])).toBe('HD');

        // The full label drives an instant `data-tip` tooltip instead of
        // the native `title`, which never shows on touch/TV and lags on
        // hover.
        expect(chips.map((c) => c.getAttribute('data-tip'))).toEqual(['FHD', 'HD · catch-up']);

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

    it('falls back to a localized "alt" caption for a feed with no parsed quality', async () => {
        const mounted = mountTemplate(`
            <div data-each="player.variants" data-action="click" data-fn="live/playVariant">
                <button data-testid="chip">
                    <span data-testid="caption" data-if="item.quality">{{ item.quality }}</span>
                    <span data-testid="caption-alt" data-if="!item.quality">{{ strings.live.variants.alt }}</span>
                </button>
            </div>
        `);
        await seedStrings();

        setActiveChannel(NPO);
        setValue(PLAYER_VARIANTS, [
            { id: 'a', url: 'http://x/a.ts', label: 'Feed 2', quality: null, isRecording: false, provider: null, tier: 0 },
        ]);
        tick();

        const chip = mounted.query('[data-testid="chip"]');
        expect(chip?.querySelector<HTMLElement>('[data-testid="caption"]')?.style.display).toBe('none');
        expect(chip?.querySelector<HTMLElement>('[data-testid="caption-alt"]')?.textContent).toBe('alt');

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
