import type Hls from 'hls.js';
import { describe, expect, it } from 'vitest';
import { createHlsTrackEngine, mapHlsTracks, type HlsTrackLike } from './hls-tracks';

describe('mapHlsTracks', () => {
    it('maps name/lang to label/lang, marking the active-index entry', () => {
        const tracks: HlsTrackLike[] = [{ name: 'English', lang: 'en' }, { name: 'Dutch', lang: 'nl' }];
        expect(mapHlsTracks(tracks, 1)).toEqual([
            { id: '0', label: 'English', lang: 'en', active: false },
            { id: '1', label: 'Dutch', lang: 'nl', active: true },
        ]);
    });

    it('falls back label to lang, then to Track N, when name is missing', () => {
        const tracks: HlsTrackLike[] = [{ lang: 'fr' }, {}];
        expect(mapHlsTracks(tracks, -1)).toEqual([
            { id: '0', label: 'fr', lang: 'fr', active: false },
            { id: '1', label: 'Track 2', lang: '', active: false },
        ]);
    });

    it('marks nothing active when activeIndex is -1 (subtitles off)', () => {
        const tracks: HlsTrackLike[] = [{ name: 'A' }, { name: 'B' }];
        const mapped = mapHlsTracks(tracks, -1);
        expect(mapped.every((track) => !track.active)).toBe(true);
    });

    it('returns an empty list for an empty track list', () => {
        expect(mapHlsTracks([], 0)).toEqual([]);
    });
});

/** A minimal fake standing in for the real `Hls` instance — only the members `createHlsTrackEngine` actually touches. */
function fakeHls(overrides: Partial<Hls> = {}): Hls {
    return {
        audioTracks: [],
        audioTrack: -1,
        subtitleTracks: [],
        subtitleTrack: -1,
        subtitleDisplay: true,
        ...overrides,
    } as unknown as Hls;
}

describe('createHlsTrackEngine', () => {
    it('reports audio/subtitle snapshots from the underlying instance', () => {
        const hls = fakeHls({
            audioTracks: [{ name: 'English', lang: 'en' }, { name: 'Dutch', lang: 'nl' }] as Hls['audioTracks'],
            audioTrack: 0,
            subtitleTracks: [{ name: 'English', lang: 'en' }] as Hls['subtitleTracks'],
            subtitleTrack: -1,
        });
        const { engine } = createHlsTrackEngine(hls);
        expect(engine.getTracks?.()).toEqual({
            audio: [
                { id: '0', label: 'English', lang: 'en', active: true },
                { id: '1', label: 'Dutch', lang: 'nl', active: false },
            ],
            subtitles: [{ id: '0', label: 'English', lang: 'en', active: false }],
        });
    });

    it('setAudioTrack writes the parsed index to hls.audioTrack', () => {
        const hls = fakeHls();
        const { engine } = createHlsTrackEngine(hls);
        engine.setAudioTrack?.('2');
        expect(hls.audioTrack).toBe(2);
    });

    it('ignores a non-numeric audio track id', () => {
        const hls = fakeHls({ audioTrack: 3 });
        const { engine } = createHlsTrackEngine(hls);
        engine.setAudioTrack?.('nope');
        expect(hls.audioTrack).toBe(3);
    });

    it('setSubtitleTrack(null) turns subtitles off: index -1 and display false', () => {
        const hls = fakeHls({ subtitleTrack: 1, subtitleDisplay: true });
        const { engine } = createHlsTrackEngine(hls);
        engine.setSubtitleTrack?.(null);
        expect(hls.subtitleTrack).toBe(-1);
        expect(hls.subtitleDisplay).toBe(false);
    });

    it('setSubtitleTrack(id) selects the index and re-enables display', () => {
        const hls = fakeHls({ subtitleTrack: -1, subtitleDisplay: false });
        const { engine } = createHlsTrackEngine(hls);
        engine.setSubtitleTrack?.('0');
        expect(hls.subtitleTrack).toBe(0);
        expect(hls.subtitleDisplay).toBe(true);
    });

    it('notifyTracksChanged calls the single registered listener', () => {
        const hls = fakeHls();
        const { engine, notifyTracksChanged } = createHlsTrackEngine(hls);
        let calls = 0;
        engine.onTracksChanged?.(() => {
            calls += 1;
        });
        notifyTracksChanged();
        notifyTracksChanged();
        expect(calls).toBe(2);
    });

    it('notifyTracksChanged is a no-op before any listener is registered', () => {
        const hls = fakeHls();
        const { notifyTracksChanged } = createHlsTrackEngine(hls);
        expect(() => notifyTracksChanged()).not.toThrow();
    });
});
