import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import type { MediaTrack, TrackSnapshot } from '../player/tracks';
import { PLAYER_AUDIO_TRACKS, PLAYER_SUBTITLE_TRACKS, PLAYER_TRACK_MENU } from './player-tracks';
import {
    registerTrackSync,
    resetPlayerTracksForTests,
    setAudioTrack,
    setSubtitleTrack,
    toggleAudioMenu,
    toggleSubtitleMenu,
    type TrackEngineAccess,
} from './player-tracks.actions';
import { get } from './typed';

/**
 * A fake engine seam (mirroring `withFakePlatform`/`resetPlayerEngineForTests`,
 * per this module's own doc): a plain in-memory `TrackSnapshot` with a
 * changeable "active" flag per track, so tests can drive `onTracksChanged()`
 * without a real hls.js/mpegts.js/native attach.
 */
function makeTrack(id: string, label: string, lang: string, active = false): MediaTrack {
    return { id, label, lang, active };
}

function makeFakeEngine(initial: TrackSnapshot): {
    access: TrackEngineAccess;
    audioCalls: string[];
    subtitleCalls: (string | null)[];
    fireTracksChanged: () => void;
} {
    let snapshot = initial;
    let listener: (() => void) | null = null;
    const audioCalls: string[] = [];
    const subtitleCalls: (string | null)[] = [];

    const access: TrackEngineAccess = {
        getPlayerTracks: () => snapshot,
        setAudioTrack: (id) => {
            audioCalls.push(id);
            snapshot = { ...snapshot, audio: snapshot.audio.map((t) => ({ ...t, active: t.id === id })) };
        },
        setSubtitleTrack: (id) => {
            subtitleCalls.push(id);
            snapshot = { ...snapshot, subtitles: snapshot.subtitles.map((t) => ({ ...t, active: t.id === id })) };
        },
        onTracksChanged: (cb) => {
            listener = cb;
        },
    };

    return { access, audioCalls, subtitleCalls, fireTracksChanged: () => listener?.() };
}

describe('player-tracks.actions.ts: menus and track selection', () => {
    /** `registerTrackSync()`'s own unwatch — captured and called in `afterEach` so its `player.active` watch does not accumulate across tests (`resetState()` clears state, not registered `watch()` systems). */
    let unregister: (() => void) | undefined;

    function sync(access: TrackEngineAccess): void {
        unregister = registerTrackSync(access);
    }

    afterEach(() => {
        unregister?.();
        unregister = undefined;
        resetPlayerTracksForTests();
        resetState();
    });

    it('toggling a menu open republishes both track lists from the engine', () => {
        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng', true), makeTrack('1', 'Nederlands', 'nld')],
            subtitles: [makeTrack('0', 'English', 'eng')],
        });
        sync(fake.access);

        toggleAudioMenu();
        tick();

        expect(get<string>(PLAYER_TRACK_MENU)).toBe('audio');
        expect(get<MediaTrack[]>(PLAYER_AUDIO_TRACKS)).toHaveLength(2);
        expect(get<MediaTrack[]>(PLAYER_SUBTITLE_TRACKS)).toHaveLength(1);
    });

    it('toggling the same menu again closes it', () => {
        const fake = makeFakeEngine({ audio: [], subtitles: [] });
        sync(fake.access);

        toggleAudioMenu();
        tick();
        expect(get<string>(PLAYER_TRACK_MENU)).toBe('audio');

        toggleAudioMenu();
        tick();
        expect(get<string>(PLAYER_TRACK_MENU)).toBe('none');
    });

    it('opening the subtitle menu closes an open audio menu, and vice versa', () => {
        const fake = makeFakeEngine({ audio: [], subtitles: [] });
        sync(fake.access);

        toggleAudioMenu();
        tick();
        expect(get<string>(PLAYER_TRACK_MENU)).toBe('audio');

        toggleSubtitleMenu();
        tick();
        expect(get<string>(PLAYER_TRACK_MENU)).toBe('subtitles');

        toggleAudioMenu();
        tick();
        expect(get<string>(PLAYER_TRACK_MENU)).toBe('audio');
    });

    it('an empty track list still lets the menu open (no tracks to show, not an error)', () => {
        const fake = makeFakeEngine({ audio: [], subtitles: [] });
        sync(fake.access);

        toggleAudioMenu();
        tick();

        expect(get<string>(PLAYER_TRACK_MENU)).toBe('audio');
        expect(get<MediaTrack[]>(PLAYER_AUDIO_TRACKS)).toEqual([]);
    });

    it('setAudioTrack(id) calls the engine, republishes the lists, and closes the menu', () => {
        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng', true), makeTrack('1', 'Nederlands', 'nld')],
            subtitles: [],
        });
        sync(fake.access);
        toggleAudioMenu();
        tick();

        setAudioTrack('1');
        tick();

        expect(fake.audioCalls).toEqual(['1']);
        expect(get<string>(PLAYER_TRACK_MENU)).toBe('none');
        expect(get<MediaTrack[]>(PLAYER_AUDIO_TRACKS)?.find((t) => t.id === '1')?.active).toBe(true);
    });

    it("setSubtitleTrack('off') calls the engine with null, republishes, and closes the menu", () => {
        const fake = makeFakeEngine({
            audio: [],
            subtitles: [makeTrack('0', 'English', 'eng', true)],
        });
        sync(fake.access);
        toggleSubtitleMenu();
        tick();

        setSubtitleTrack('off');
        tick();

        expect(fake.subtitleCalls).toEqual([null]);
        expect(get<string>(PLAYER_TRACK_MENU)).toBe('none');
        expect(get<MediaTrack[]>(PLAYER_SUBTITLE_TRACKS)?.every((t) => !t.active)).toBe(true);
    });

    it('setSubtitleTrack(id) with a real track id passes it straight through, not null', () => {
        const fake = makeFakeEngine({
            audio: [],
            subtitles: [makeTrack('0', 'English', 'eng', true), makeTrack('1', 'Nederlands', 'nld')],
        });
        sync(fake.access);

        setSubtitleTrack('1');
        tick();

        expect(fake.subtitleCalls).toEqual(['1']);
    });
});
