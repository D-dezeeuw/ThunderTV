import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
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

const CHANNEL: ActiveChannelSnapshot = {
    id: 'a',
    sourceId: 's',
    name: 'NPO 1',
    streamUrl: 'http://provider.test/a.ts',
    logo: null,
    group: null,
};

describe('player shell: radio layout is class-driven, not structural', () => {
    it('player.css never selects on the presence of a data-if-gated node', () => {
        // `:has()` against markup Spektrum only hides is always true. If a
        // future rule genuinely needs it, it must target something that is
        // added and removed, not something `data-if` toggles.
        expect(playerCss).not.toContain(':has(');
    });

    it('index.html binds the radio modifier to the active view', () => {
        expect(indexHtml).toContain("'player-shell--radio': view.radio.active");
    });

    it('adds player-shell--radio only in the Radio view', () => {
        const mounted = mountTemplate(`
            <div
                class="player-shell"
                :class="{ 'player-shell--radio': view.radio.active }"
                data-if="player.active"
                data-testid="player-shell"
            >
                <video class="player-shell__video" data-testid="player-video"></video>
                <div class="radio-now-playing" data-if="view.radio.active" data-testid="radio-now-playing"></div>
            </div>
        `);
        const shell = (): HTMLElement | null => mounted.query('[data-testid="player-shell"]');

        setActiveChannel(CHANNEL);
        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        expect(shell()?.style.display).toBe('');
        expect(shell()?.classList.contains('player-shell--radio')).toBe(false);
        // The radio pane is hidden but still mounted — the exact condition
        // that made the `:has()` selector fire in Live.
        expect(mounted.query('[data-testid="radio-now-playing"]')).not.toBeNull();

        setValue(UI_ACTIVE_VIEW, 'radio');
        tick();
        expect(shell()?.classList.contains('player-shell--radio')).toBe(true);

        mounted.cleanup();
    });
});

/**
 * Movies/TV Shows played into the same `<video>` as Live — but the pane
 * holding it was gated on `view.live.active || view.radio.active`, and
 * `data-if` only sets `display: none`. Pressing Play on a movie therefore
 * gave you audio, no picture, and nothing to fullscreen.
 */
describe('now-playing pane covers every view that plays something', () => {
    it('index.html shows the pane in Movies/TV Shows once something is playing', () => {
        expect(indexHtml).toContain(
            'data-if="view.live.active || view.radio.active || ((view.movies.active || view.series.active) && player.active)"',
        );
    });

    it('the fullscreen button carries no view gate — the shell itself is the gate', () => {
        const button = /<button[^>]*data-fn="player\/fullscreen"[^>]*>/.exec(indexHtml)?.[0] ?? '';
        expect(button).not.toBe('');
        expect(button).not.toContain('data-if');
    });

    it('renders the pane in Movies only while a title is playing', () => {
        const mounted = mountTemplate(`
            <div
                class="now-playing"
                data-if="view.live.active || view.radio.active || ((view.movies.active || view.series.active) && player.active)"
                data-testid="now-playing-pane"
            ></div>
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
