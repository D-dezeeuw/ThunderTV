import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
import { PLAYER_AUDIO_MODE } from '../state/player';
import { setActiveChannel } from '../state/player.actions';
import type { ActiveChannelSnapshot } from '../state/records';
import { UI_ACTIVE_VIEW } from '../state/ui';

/**
 * The Live view showed no picture: the video element was collapsed to 1x1
 * by a `.player-shell:has(.radio-now-playing)` rule. Spektrum's `data-if`
 * sets `display: none` and leaves the node mounted (see
 * bind-dom-flagship.spec.ts), so that structural selector matched in Live
 * as well as Radio and hid the picture in both.
 *
 * Two guards, because the bug needed both halves to reappear: the markup
 * must carry a state-driven modifier class, and the stylesheet must key off
 * that class rather than the presence of a `data-if`-gated child.
 */

const repoRoot = fileURLToPath(new NodeURL('../..', import.meta.url));
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');
const playerCss = stripComments(readFileSync(`${repoRoot}/src/styles/player.css`, 'utf8'));
const indexHtml = readFileSync(`${repoRoot}/index.html`, 'utf8');

/**
 * The real `.now-playing` gate, read straight out of index.html rather than
 * copied into this file — so the specs below assert the expression that
 * actually ships, and mounting it here exercises the same one.
 */
const NOW_PLAYING_GATE = /class="now-playing"\s+data-if="([^"]+)"/.exec(indexHtml)?.[1] ?? '';

const CHANNEL: ActiveChannelSnapshot = {
    id: 'a',
    sourceId: 's',
    name: 'NPO 1',
    streamUrl: 'http://provider.test/a.ts',
    logo: null,
    group: null,
};

describe('player shell: audio-only layout is class-driven, not structural', () => {
    it('player.css never selects on the presence of a data-if-gated node', () => {
        // `:has()` against markup Spektrum only hides is always true. If a
        // future rule genuinely needs it, it must target something that is
        // added and removed, not something `data-if` toggles.
        expect(playerCss).not.toContain(':has(');
    });

    it('index.html binds the audio modifier to the shared visualizerActive selector', () => {
        expect(indexHtml).toContain("'player-shell--audio': visualizerActive");
    });

    it('adds player-shell--audio only while the visualizer stands in for the picture', () => {
        const mounted = mountTemplate(`
            <div
                class="player-shell"
                :class="{ 'player-shell--audio': visualizerActive }"
                data-if="player.active"
                data-testid="player-shell"
            >
                <video class="player-shell__video" data-testid="player-video"></video>
                <div class="radio-now-playing" data-if="visualizerActive" data-testid="radio-now-playing"></div>
            </div>
        `);
        const shell = (): HTMLElement | null => mounted.query('[data-testid="player-shell"]');

        setActiveChannel(CHANNEL);
        setValue(PLAYER_AUDIO_MODE, false);
        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        expect(shell()?.style.display).toBe('');
        expect(shell()?.classList.contains('player-shell--audio')).toBe(false);
        // The visualizer pane is hidden but still mounted — the exact
        // condition that made the `:has()` selector fire in Live.
        expect(mounted.query('[data-testid="radio-now-playing"]')).not.toBeNull();

        setValue(UI_ACTIVE_VIEW, 'radio');
        tick();
        expect(shell()?.classList.contains('player-shell--audio')).toBe(true);

        // A TV channel switched to audio-only gets the same presentation.
        setValue(UI_ACTIVE_VIEW, 'live');
        setValue(PLAYER_AUDIO_MODE, true);
        tick();
        expect(shell()?.classList.contains('player-shell--audio')).toBe(true);

        mounted.cleanup();
    });
});

/**
 * Categories is three columns — categories -> channels -> preview — which
 * only holds if the preview pane and the side-by-side modifier both cover
 * every channel-list view, not just Live/Radio.
 */
describe('Categories preview column', () => {
    it('mounts the now-playing pane for every channel-list view', () => {
        expect(indexHtml).toContain(`data-if="${NOW_PLAYING_GATE}"`);
        expect(NOW_PLAYING_GATE.startsWith('view.channelList.active')).toBe(true);
    });

    it('puts the list and the preview side by side in Categories too', () => {
        expect(indexHtml).toContain("'list-shell--split': view.channelList.active");
    });

    it('keeps the third column out of the phone drill-down until a channel list is open', () => {
        const channelListCss = stripComments(readFileSync(`${repoRoot}/src/styles/channel-list.css`, 'utf8'));
        expect(channelListCss).toContain(
            '.list-shell--has-groups:not(.list-shell--group-view) .list-shell__body > .now-playing',
        );
    });
});

/**
 * Movies/TV Shows played into the same `<video>` as the channel-list views
 * — but the pane holding it was gated on those views alone, and `data-if`
 * only sets `display: none`. Pressing Play on a movie therefore gave you
 * audio, no picture, and nothing to fullscreen.
 */
describe('now-playing pane covers every view that plays something', () => {
    it('index.html shows the pane in Movies/TV Shows once something is playing', () => {
        expect(NOW_PLAYING_GATE).toContain('(view.movies.active || view.series.active) && player.active');
    });

    it('the fullscreen button carries no view gate — the shell itself is the gate', () => {
        const button = /<button[^>]*data-fn="player\/fullscreen"[^>]*>/.exec(indexHtml)?.[0] ?? '';
        expect(button).not.toBe('');
        expect(button).not.toContain('data-if');
    });

    it('renders the pane in Movies only while a title is playing', () => {
        const mounted = mountTemplate(`
            <div class="now-playing" data-if="${NOW_PLAYING_GATE}" data-testid="now-playing-pane"></div>
        `);
        const pane = (): HTMLElement | null => mounted.query('[data-testid="now-playing-pane"]');

        setValue(UI_ACTIVE_VIEW, 'movies');
        tick();
        expect(pane()?.style.display).toBe('none');

        setActiveChannel({ ...CHANNEL, kind: 'vod' });
        tick();
        expect(pane()?.style.display).toBe('');

        mounted.cleanup();
    });
});

describe('channel-list layout fills the view', () => {
    it('the channel-list section opts into the full-height flex column', () => {
        expect(indexHtml).toContain('class="view__section view__section--fill" data-if="view.channelList.active"');
    });

    it('the list body flexes instead of pinning itself to a viewport fraction', () => {
        const channelListCss = stripComments(readFileSync(`${repoRoot}/src/styles/channel-list.css`, 'utf8'));
        const body = /\.list-shell__body \{([^}]*)\}/.exec(channelListCss)?.[1] ?? '';
        expect(body).toContain('flex: 1');
        expect(body).not.toContain('60vh');
    });
});

/**
 * A `:href` binding on an SVG `<use>` element crashed the whole bind walk.
 * Spektrum's generic `:attr` binder only routes through `setAttribute()` for
 * hyphenated attribute names (Feature: `Qt()` in the vendored engine); a
 * hyphen-less name like `href` is instead assigned as a plain DOM property
 * (`element.href = value`). On an ordinary element that is harmless (e.g.
 * `<a>`'s `.href` is a normal writable string), but `<use>` (and every other
 * SVGURIReference element) exposes `href` as a *read-only* accessor
 * returning an `SVGAnimatedString` — assigning to it throws a `TypeError`,
 * synchronously, outside any try/catch in the bind walk's per-element loop.
 * Because `bindDOM()` walks the DOM in document order with no per-element
 * recovery, that throw aborts binding for every element *after* the
 * offending one — which is how a crash in the player dock (early in
 * index.html) left the debug panel near the end of the document permanently
 * visible (its own `data-if="debug.open"` binding never ran, so it kept
 * `.debug-panel`'s CSS `display: flex` default) with an inert close button
 * (its `data-action` binding never ran either).
 */
describe('no dynamic :href binding on an SVG <use> element', () => {
    it('index.html never binds :href on a <use> — it would throw and abort the rest of the bind walk', () => {
        const useTags = indexHtml.match(/<use\b[^>]*>/g) ?? [];
        expect(useTags.length).toBeGreaterThan(0);
        for (const tag of useTags) expect(tag).not.toMatch(/:href=/);
    });

    // Note: real browsers implement `<use>`'s `href` as a read-only
    // SVGURIReference accessor (assigning throws a TypeError), which is the
    // actual mechanism behind the bug this describe block guards against —
    // jsdom's SVG support does not model that read-only accessor, so it
    // can't reproduce the throw here. The static guard above and the
    // working-pattern test below are what actually protect this repo.
    it('a two-icon data-if toggle (the fix) mounts without throwing and swaps the visible icon', () => {
        const mounted = mountTemplate(`
            <svg data-testid="icon">
                <use data-if="player.paused" data-testid="use-play" href="#icon-play"></use>
                <use data-if="!player.paused" data-testid="use-stop" href="#icon-stop"></use>
            </svg>
            <span data-testid="after">{{ debug.open ? 'open' : 'closed' }}</span>
        `);

        // The sentinel after the icon proves the bind walk reached and bound
        // every subsequent element — the exact thing a :href crash prevented.
        expect(mounted.query('[data-testid="after"]')?.textContent).toBe('closed');
        expect(mounted.query('[data-testid="use-play"]')?.style.display).toBe('none');
        expect(mounted.query('[data-testid="use-stop"]')?.style.display).toBe('');

        setValue('player.paused', true);
        tick();
        expect(mounted.query('[data-testid="use-play"]')?.style.display).toBe('');
        expect(mounted.query('[data-testid="use-stop"]')?.style.display).toBe('none');

        mounted.cleanup();
    });
});
