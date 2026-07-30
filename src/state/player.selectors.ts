import { computed, type State } from 'spektrum';
import { strings } from '../app/strings';
import type { MediaTrack } from '../player/tracks';
import { isAudioVisual, PLAYER_AUDIO_MODE, PLAYER_STREAM_HEALTH, PLAYER_VISUALIZER_PRESET, PLAYER_ZAP_HISTORY } from './player';
import { PLAYER_SUBTITLE_TRACKS } from './player-tracks';
import { SETTINGS_LOCALE } from './settings';
import { UI_ACTIVE_VIEW } from './ui';

/**
 * The third selector module named by Feature 05.6.1 alongside
 * `playlist.selectors.ts`/`ui.selectors.ts`. `hasNoZapHistory` is the gate
 * the Recent view's stub (Feature 05.4.6/05.5.6) uses to switch between its
 * empty state and the `data-each` list of `player.zapHistory` snapshots —
 * the cache's first visible consumer, ahead of Phase 13's real recent UI.
 */
export function registerPlayerSelectors(): void {
    computed('hasNoZapHistory', [PLAYER_ZAP_HISTORY], (state: State) => {
        const zapHistory = (state as { player?: { zapHistory?: unknown[] } }).player?.zapHistory;
        return !zapHistory || zapHistory.length === 0;
    });

    /** Whether the subtitle popup's fixed "Off" row should read as active — true whenever no published subtitle track currently carries `active: true` (including the empty-list case, where "Off" is the only real state there is). */
    computed('subtitlesOffActive', [PLAYER_SUBTITLE_TRACKS], (state: State) => {
        const tracks = (state as { player?: { subtitleTracks?: MediaTrack[] } }).player?.subtitleTracks;
        return !tracks || !tracks.some((track) => track.active);
    });

    /**
     * Tooltip/label for the player-bar signal bars — the readable half of
     * `player.streamHealth`. `SETTINGS_LOCALE` is an added dep so a live
     * language switch (`strings` is a reassigned singleton, not a Spektrum
     * key) refreshes this label immediately.
     */
    computed('streamHealthLabel', [PLAYER_STREAM_HEALTH, SETTINGS_LOCALE], (state: State) => {
        const health = (state as { player?: { streamHealth?: string | null } }).player?.streamHealth;
        if (health === 'poor') return strings.list.signalPoor;
        if (health === 'fair') return strings.list.signalFair;
        return strings.list.signalGood;
    });

    /**
     * Whether the visualizer pane replaces the picture: Radio always, a TV
     * channel only when the viewer switched to audio-only. Every piece of
     * player markup that used to compare against `view.radio.active` binds
     * to this instead, so the two presentations stay one decision.
     */
    computed('visualizerActive', [UI_ACTIVE_VIEW, PLAYER_AUDIO_MODE], (state: State) => {
        const typed = state as { ui?: { activeView?: string }; player?: { audioMode?: boolean } };
        return isAudioVisual(typed.ui?.activeView, typed.player?.audioMode ?? false);
    });

    /** The visualizer picker's rows, ready to `data-each` — see `VISUALIZER_PICKER_OPTIONS`. `SETTINGS_LOCALE` is a dep for the same reason `streamHealthLabel` needs it. */
    computed('visualizerPresetOptions', [PLAYER_VISUALIZER_PRESET, SETTINGS_LOCALE], (state: State) => {
        const current = currentVisualizerPreset(state);
        return VISUALIZER_PICKER_OPTIONS.map((option) => ({
            id: option.id,
            label: listString(option.labelKey, option.id),
            // Only the first row of a group carries the heading — the markup
            // renders it above that row, reproducing the <optgroup> labels
            // the native picker used to draw for free.
            groupLabel: option.groupKey ? listString(option.groupKey, '') : '',
            active: option.id === current,
        }));
    });

    /** What the picker's trigger button reads — the current preset's own name, so the choice is legible without opening the menu (a `<select>` showed it for free). */
    computed('visualizerPresetLabel', [PLAYER_VISUALIZER_PRESET, SETTINGS_LOCALE], (state: State) => {
        const current = currentVisualizerPreset(state);
        const option = VISUALIZER_PICKER_OPTIONS.find((entry) => entry.id === current) ?? VISUALIZER_PICKER_OPTIONS[0];
        return listString(option?.labelKey ?? '', strings.list.visualizerPickerLabel);
    });
}

interface VisualizerPickerOption {
    /** A `createRadioVisualizerPresets()` preset id, or the `'auto'` sentinel. */
    id: string;
    /** Key into `strings.list` for this row's name. */
    labelKey: string;
    /** Key into `strings.list` for the group heading this row opens, or `''` for a row that continues the group above it. */
    groupKey: string;
}

/**
 * The visualizer picker's option catalog — ids, labels and group headings in
 * one place rather than hand-authored into `index.html` eleven times, so the
 * markup is a single `data-each` and `visualizer-picker.markup.spec.ts` can
 * check this list against the real presets instead of scraping HTML.
 *
 * Order matches `createRadioVisualizerPresets()`'s abstract-then-genre
 * ordering, except that the genres lead: they are the rows a listener
 * actually reaches for ("play the jazz one"), and the abstract presets are
 * what "Auto" already cycles through.
 */
export const VISUALIZER_PICKER_OPTIONS: readonly VisualizerPickerOption[] = [
    { id: 'auto', labelKey: 'visualizerAuto', groupKey: '' },
    { id: 'edm', labelKey: 'visualizerEdm', groupKey: 'visualizerGenreGroup' },
    { id: 'jazz', labelKey: 'visualizerJazz', groupKey: '' },
    { id: 'blues', labelKey: 'visualizerBlues', groupKey: '' },
    { id: 'rock', labelKey: 'visualizerRock', groupKey: '' },
    { id: 'metal', labelKey: 'visualizerMetal', groupKey: '' },
    { id: 'classical', labelKey: 'visualizerClassical', groupKey: '' },
    { id: 'spectrum', labelKey: 'visualizerSpectrum', groupKey: 'visualizerAbstractGroup' },
    { id: 'particles', labelKey: 'visualizerParticles', groupKey: '' },
    { id: 'kaleidoscope', labelKey: 'visualizerKaleidoscope', groupKey: '' },
    { id: 'fractal-tunnel', labelKey: 'visualizerFractalTunnel', groupKey: '' },
];

function currentVisualizerPreset(state: State): string {
    return (state as { player?: { visualizerPreset?: string } }).player?.visualizerPreset ?? 'auto';
}

/** `strings.list` is a flat record of copy; the picker addresses it by key, which TypeScript can't narrow from data. */
function listString(key: string, fallback: string): string {
    const value = (strings.list as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : fallback;
}
