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
        expect(indexHtml).toContain('class="now-playing" data-if="view.channelList.active"');
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
