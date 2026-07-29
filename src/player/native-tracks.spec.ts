import { describe, expect, it, vi } from 'vitest';
import { createNativeTrackEngine, mapAudioTracks, mapTextTracks, type AudioTrackLike, type TextTrackLike } from './native-tracks';

describe('mapAudioTracks', () => {
    it('maps label/language/enabled to MediaTrack, id = list index', () => {
        const tracks: AudioTrackLike[] = [
            { label: 'English', language: 'en', enabled: true },
            { label: 'Dutch', language: 'nl', enabled: false },
        ];
        expect(mapAudioTracks(tracks)).toEqual([
            { id: '0', label: 'English', lang: 'en', active: true },
            { id: '1', label: 'Dutch', lang: 'nl', active: false },
        ]);
    });

    it('falls back label to language, then Track N', () => {
        const tracks: AudioTrackLike[] = [
            { label: '', language: 'fr', enabled: false },
            { label: '', language: '', enabled: false },
        ];
        expect(mapAudioTracks(tracks)).toEqual([
            { id: '0', label: 'fr', lang: 'fr', active: false },
            { id: '1', label: 'Track 2', lang: '', active: false },
        ]);
    });

    it('returns an empty list for an empty track list', () => {
        expect(mapAudioTracks([])).toEqual([]);
    });
});

describe('mapTextTracks', () => {
    it('keeps only subtitles/captions kinds, id = real list index', () => {
        const tracks: TextTrackLike[] = [
            { kind: 'metadata', label: '', language: '', mode: 'disabled' },
            { kind: 'subtitles', label: 'English', language: 'en', mode: 'showing' },
            { kind: 'captions', label: 'English (CC)', language: 'en', mode: 'disabled' },
        ];
        expect(mapTextTracks(tracks)).toEqual([
            { id: '1', label: 'English', lang: 'en', active: true },
            { id: '2', label: 'English (CC)', lang: 'en', active: false },
        ]);
    });

    it('active reflects mode === "showing"', () => {
        const tracks: TextTrackLike[] = [{ kind: 'subtitles', label: 'A', language: 'en', mode: 'hidden' }];
        expect(mapTextTracks(tracks)[0]?.active).toBe(false);
    });

    it('returns an empty list for an empty track list', () => {
        expect(mapTextTracks([])).toEqual([]);
    });
});

/** A fake standing in for `AudioTrackList`/`TextTrackList` — array-backed with `addEventListener`/`removeEventListener` spies, matching what `createNativeTrackEngine` actually calls. */
function fakeList<T extends object>(items: T[]): T[] & { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> } {
    const list = items as T[] & { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
    list.addEventListener = vi.fn();
    list.removeEventListener = vi.fn();
    return list;
}

function fakeVideo(options: { audioTracks?: object[]; textTracks?: object[] } = {}): HTMLVideoElement {
    const video: Record<string, unknown> = {
        textTracks: fakeList(options.textTracks ?? []),
    };
    if (options.audioTracks) video.audioTracks = fakeList(options.audioTracks);
    return video as unknown as HTMLVideoElement;
}

describe('createNativeTrackEngine', () => {
    it('reports empty audio when the browser exposes no audioTracks API', () => {
        const video = fakeVideo({ textTracks: [] });
        const { engine } = createNativeTrackEngine(video);
        expect(engine.getTracks?.()).toEqual({ audio: [], subtitles: [] });
    });

    it('reports mapped audio/subtitles when both APIs are present', () => {
        const video = fakeVideo({
            audioTracks: [{ label: 'English', language: 'en', enabled: true }],
            textTracks: [{ kind: 'subtitles', label: 'English', language: 'en', mode: 'showing' }],
        });
        const { engine } = createNativeTrackEngine(video);
        expect(engine.getTracks?.()).toEqual({
            audio: [{ id: '0', label: 'English', lang: 'en', active: true }],
            subtitles: [{ id: '0', label: 'English', lang: 'en', active: true }],
        });
    });

    it('setAudioTrack enables only the matching index', () => {
        const audioTracks = [
            { label: 'English', language: 'en', enabled: true },
            { label: 'Dutch', language: 'nl', enabled: false },
        ];
        const video = fakeVideo({ audioTracks });
        const { engine } = createNativeTrackEngine(video);
        engine.setAudioTrack?.('1');
        expect(audioTracks[0]?.enabled).toBe(false);
        expect(audioTracks[1]?.enabled).toBe(true);
    });

    it("setSubtitleTrack(null) disables every subtitle/caption track", () => {
        const textTracks = [
            { kind: 'subtitles', label: 'English', language: 'en', mode: 'showing' },
            { kind: 'captions', label: 'CC', language: 'en', mode: 'disabled' },
        ];
        const video = fakeVideo({ textTracks });
        const { engine } = createNativeTrackEngine(video);
        engine.setSubtitleTrack?.(null);
        expect(textTracks[0]?.mode).toBe('disabled');
        expect(textTracks[1]?.mode).toBe('disabled');
    });

    it('setSubtitleTrack(id) shows only the matching track and leaves non-subtitle kinds untouched', () => {
        const textTracks = [
            { kind: 'metadata', label: '', language: '', mode: 'disabled' },
            { kind: 'subtitles', label: 'English', language: 'en', mode: 'disabled' },
            { kind: 'captions', label: 'CC', language: 'en', mode: 'disabled' },
        ];
        const video = fakeVideo({ textTracks });
        const { engine } = createNativeTrackEngine(video);
        engine.setSubtitleTrack?.('2');
        expect(textTracks[0]?.mode).toBe('disabled');
        expect(textTracks[1]?.mode).toBe('disabled');
        expect(textTracks[2]?.mode).toBe('showing');
    });

    it('wires addtrack/change listeners on construction and unwires them on dispose', () => {
        const audioTracks = fakeList([]);
        const textTracks = fakeList([]);
        const video = { audioTracks, textTracks } as unknown as HTMLVideoElement;

        const { dispose } = createNativeTrackEngine(video);
        expect(audioTracks.addEventListener).toHaveBeenCalledWith('addtrack', expect.any(Function));
        expect(audioTracks.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
        expect(textTracks.addEventListener).toHaveBeenCalledWith('addtrack', expect.any(Function));
        expect(textTracks.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

        dispose();
        expect(audioTracks.removeEventListener).toHaveBeenCalledWith('addtrack', expect.any(Function));
        expect(textTracks.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('never throws when audioTracks/textTracks are plain arrays without addEventListener (jsdom test stand-ins)', () => {
        const video = { audioTracks: [], textTracks: [] } as unknown as HTMLVideoElement;
        expect(() => {
            const { dispose } = createNativeTrackEngine(video);
            dispose();
        }).not.toThrow();
    });

    it('onTracksChanged fires the single registered listener when the underlying list signals a change', () => {
        const textTracks = fakeList<{ kind: string; label: string; language: string; mode: string }>([]);
        const video = { textTracks } as unknown as HTMLVideoElement;
        const { engine } = createNativeTrackEngine(video);

        let calls = 0;
        engine.onTracksChanged?.(() => {
            calls += 1;
        });
        const handler = textTracks.addEventListener.mock.calls[0]?.[1] as (() => void) | undefined;
        handler?.();
        expect(calls).toBe(1);
    });
});
