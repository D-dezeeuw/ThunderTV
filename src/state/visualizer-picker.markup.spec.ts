import { tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { mountTemplate, type MountedTemplate } from '../shared/testing/bind-dom';
import { closeTopmostOverlay } from './back-navigation';
import { PLAYER_VISUALIZER_PRESET } from './player';
import { PLAYER_TRACK_MENU } from './player-tracks';
import { toggleAudioMenu } from './player-tracks.actions';
import { get } from './typed';

/**
 * Radio's visualizer picker, mounted for real. It replaced a native
 * `<select>` because on webOS the dropdown a `<select>` opens is a
 * browser-level widget outside the page: the LG simulator injects remote
 * keys into the page, so the popup could be opened but never navigated or
 * dismissed, and each further OK press re-triggered the still-focused
 * `<select>` — a dropdown that reactivated itself forever.
 *
 * What that makes worth testing is the state machine the replacement stands
 * on: opening is a *toggle* (a second OK closes it, so it can never latch),
 * a pick both applies and closes, and Back gets a viewer out of it on a
 * remote that has no Escape key.
 *
 * A hand-authored fragment mirroring `index.html`'s picker, same convention
 * as `settings.locale.markup.spec.ts`.
 */
const PICKER_HTML = `
<div class="track-menu-anchor" data-if="visualizerActive">
    <button
        type="button"
        class="btn"
        :aria-expanded="player.trackMenu === 'visualizer'"
        data-action="click"
        data-fn="player/toggleVisualizerMenu"
        data-testid="radio-visualizer-btn"
    >
        {{ visualizerPresetLabel }}
    </button>
    <div
        class="track-menu-backdrop"
        data-if="player.trackMenu === 'visualizer'"
        data-action="click"
        data-fn="player/closeTrackMenu"
    >
        <div class="track-menu" role="dialog" data-ref="visualizerPresetMenu" data-testid="visualizer-preset-menu">
            <div class="track-menu__list" role="listbox" data-each="visualizerPresetOptions">
                <div class="track-menu__row">
                    <p class="track-menu__group" data-if="item.groupLabel">{{ item.groupLabel }}</p>
                    <button
                        type="button"
                        class="track-menu__item"
                        :class="{ 'track-menu__item--active': item.active }"
                        role="option"
                        data-action="click"
                        data-fn="player/setVisualizerPreset"
                        :data-value="item.id"
                        data-testid="visualizer-preset-item"
                    >
                        <span class="track-menu__label">{{ item.label }}</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>`;

describe('Radio visualizer picker (replacing the native <select>)', () => {
    let ui: MountedTemplate | undefined;

    afterEach(() => {
        ui?.cleanup();
        ui = undefined;
    });

    function open(): void {
        ui?.dispatch('player/toggleVisualizerMenu');
    }

    function rows(): HTMLElement[] {
        return ui?.queryAll('[data-testid="visualizer-preset-item"]') ?? [];
    }

    function pick(id: string): void {
        const row = rows().find((item) => item.dataset['value'] === id);
        if (!row) throw new Error(`no picker row for "${id}"`);
        row.click();
        tick();
    }

    function menu(): string | undefined {
        return get<string>(PLAYER_TRACK_MENU);
    }

    it('opens on the trigger and closes on a second press — never latches open', () => {
        ui = mountTemplate(PICKER_HTML);
        expect(menu()).toBe('none');

        open();
        expect(menu()).toBe('visualizer');
        expect(ui.query('[data-testid="radio-visualizer-btn"]')?.getAttribute('aria-expanded')).toBe('true');

        open();
        expect(menu()).toBe('none');
    });

    it('picking a preset applies it and closes the menu in one press', () => {
        ui = mountTemplate(PICKER_HTML);
        open();
        pick('jazz');

        expect(get<string>(PLAYER_VISUALIZER_PRESET)).toBe('jazz');
        expect(menu()).toBe('none');
    });

    it('marks the current preset active and labels the trigger with it', () => {
        ui = mountTemplate(PICKER_HTML);
        open();
        pick('fractal-tunnel');
        open();

        const active = rows().filter((row) => row.classList.contains('track-menu__item--active'));
        expect(active.map((row) => row.dataset['value'])).toEqual(['fractal-tunnel']);
        expect(ui.query('[data-testid="radio-visualizer-btn"]')?.textContent?.trim()).toBe('Fractal Tunnel');
    });

    it('heads each group once, on the row that opens it', () => {
        ui = mountTemplate(PICKER_HTML);
        open();
        const headings = (ui.queryAll('.track-menu__group') ?? []).filter((el) => el.style.display !== 'none');
        expect(headings.map((el) => el.textContent?.trim())).toEqual(['By genre', 'Abstract']);
    });

    it('Back closes it — the only way out on a remote with no Escape key', () => {
        ui = mountTemplate(PICKER_HTML);
        open();

        expect(closeTopmostOverlay()).toBe(true);
        tick();
        expect(menu()).toBe('none');
        // Nothing else open: Back must fall through so the platform can act
        // (webOS exits the app) rather than trapping the viewer.
        expect(closeTopmostOverlay()).toBe(false);
    });

    it('is mutually exclusive with the audio-track menu — one dock popup at a time', () => {
        ui = mountTemplate(PICKER_HTML);
        open();
        toggleAudioMenu();
        tick();
        expect(menu()).toBe('audio');
    });
});
