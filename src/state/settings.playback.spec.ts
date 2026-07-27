import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { isPlaybackEngine, PLAYBACK_ENGINES, SETTINGS_DEFAULTS, SETTINGS_PLAYBACK_ENGINE } from './settings';
import { get } from './typed';

describe('playback engine setting', () => {
    afterEach(() => {
        resetState();
    });

    it('defaults to mpegts — most Xtream panels serve raw transport streams', () => {
        expect(SETTINGS_DEFAULTS.playbackEngine).toBe('mpegts');
    });

    it('isPlaybackEngine accepts exactly the three engines', () => {
        for (const engine of PLAYBACK_ENGINES) expect(isPlaybackEngine(engine)).toBe(true);
        expect(isPlaybackEngine('vlc')).toBe(false);
        expect(isPlaybackEngine(undefined)).toBe(false);
        expect(isPlaybackEngine(2)).toBe(false);
    });

    it('round-trips a chosen engine through state', () => {
        setValue(SETTINGS_PLAYBACK_ENGINE, 'hls');
        tick();
        expect(get(SETTINGS_PLAYBACK_ENGINE)).toBe('hls');
    });
});
