import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import type { MediaTrack, TrackSnapshot } from '../player/tracks';
import { PLAYER_ACTIVE } from './player';
import { PLAYER_AUDIO_TRACKS, PLAYER_TRACK_MENU } from './player-tracks';
import { registerTrackSync, resetPlayerTracksForTests, setAudioTrack, toggleAudioMenu, type TrackEngineAccess } from './player-tracks.actions';
import type { ActiveChannelSnapshot } from './records';
import { SETTINGS_AUDIO_LANGUAGE, SETTINGS_LIVE_COUNTRY, SETTINGS_SUBTITLE_LANGUAGE } from './settings';
import { get } from './typed';

/**
 * `registerTrackSync()`'s once-per-stream language-default application —
 * see its own doc in `player-tracks.actions.ts` for the "why" of the
 * `id`+`streamUrl` stream key. Uses the same fake-engine seam as
 * `player-tracks.actions.spec.ts`.
 */
function makeTrack(id: string, label: string, lang: string, active = false): MediaTrack {
    return { id, label, lang, active };
}

function makeFakeEngine(initial: TrackSnapshot): {
    access: TrackEngineAccess;
    audioCalls: string[];
    subtitleCalls: (string | null)[];
    fireTracksChanged: () => void;
    setSnapshot: (next: TrackSnapshot) => void;
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

    return {
        access,
        audioCalls,
        subtitleCalls,
        fireTracksChanged: () => listener?.(),
        setSnapshot: (next) => {
            snapshot = next;
        },
    };
}

function channel(id: string, streamUrl: string): ActiveChannelSnapshot {
    return { id, sourceId: 's', name: id, streamUrl, logo: null, group: null };
}

describe('registerTrackSync(): once-per-stream language defaults', () => {
    /** Captured and unwatched in `afterEach` — see the sibling spec's identical comment for why. */
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

    it('applies the preferred audio/subtitle language on the first track-changed event for a stream', () => {
        setValue(SETTINGS_AUDIO_LANGUAGE, 'nl');
        setValue(SETTINGS_SUBTITLE_LANGUAGE, 'nl');
        setValue(SETTINGS_LIVE_COUNTRY, 'NL');
        tick();

        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng', true), makeTrack('1', 'Nederlands', 'nld')],
            subtitles: [makeTrack('0', 'Nederlands', 'nld')],
        });
        sync(fake.access);

        setValue(PLAYER_ACTIVE, channel('a', 'http://provider.test/a.ts'));
        tick();
        fake.fireTracksChanged();
        tick();

        expect(fake.audioCalls).toEqual(['1']);
        expect(fake.subtitleCalls).toEqual(['0']);
    });

    it('does not call the engine again when the pick is already the active track', () => {
        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng', true)],
            subtitles: [],
        });
        sync(fake.access);

        setValue(PLAYER_ACTIVE, channel('a', 'http://provider.test/a.ts'));
        tick();
        fake.fireTracksChanged();
        tick();

        // Default audio language is 'en' and the English track is already
        // active — track-prefs.ts's "leave whatever the engine already
        // selected alone" contract means no redundant setAudioTrack call.
        expect(fake.audioCalls).toEqual([]);
    });

    it('a second track-changed event for the SAME stream does not re-apply', () => {
        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng'), makeTrack('1', 'Nederlands', 'nld')],
            subtitles: [],
        });
        sync(fake.access);

        setValue(PLAYER_ACTIVE, channel('a', 'http://provider.test/a.ts'));
        tick();
        fake.fireTracksChanged();
        tick();
        expect(fake.audioCalls).toEqual(['0']); // English fallback (default pref 'en')

        fake.fireTracksChanged();
        tick();
        expect(fake.audioCalls).toEqual(['0']); // unchanged — still just the one call
    });

    it('zapping to a NEW stream (different id) re-applies the defaults', () => {
        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng'), makeTrack('1', 'Nederlands', 'nld')],
            subtitles: [],
        });
        sync(fake.access);

        setValue(PLAYER_ACTIVE, channel('a', 'http://provider.test/a.ts'));
        tick();
        fake.fireTracksChanged();
        tick();
        expect(fake.audioCalls).toEqual(['0']);

        setValue(PLAYER_ACTIVE, channel('b', 'http://provider.test/b.ts'));
        tick();
        fake.setSnapshot({ audio: [makeTrack('0', 'English', 'eng'), makeTrack('1', 'Nederlands', 'nld')], subtitles: [] });
        fake.fireTracksChanged();
        tick();

        expect(fake.audioCalls).toEqual(['0', '0']);
    });

    it("the same channel row switching variants (same id, new streamUrl) also re-applies — live/playVariant's re-attach", () => {
        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng'), makeTrack('1', 'Nederlands', 'nld')],
            subtitles: [],
        });
        sync(fake.access);

        setValue(PLAYER_ACTIVE, channel('a', 'http://provider.test/a-sd.ts'));
        tick();
        fake.fireTracksChanged();
        tick();
        expect(fake.audioCalls).toEqual(['0']);

        // Same row id, new streamUrl — playVariantById()'s exact shape.
        setValue(PLAYER_ACTIVE, channel('a', 'http://provider.test/a-hd.ts'));
        tick();
        fake.setSnapshot({ audio: [makeTrack('0', 'English', 'eng'), makeTrack('1', 'Nederlands', 'nld')], subtitles: [] });
        fake.fireTracksChanged();
        tick();

        expect(fake.audioCalls).toEqual(['0', '0']);
    });

    it('a manual pick made after the auto-apply is never stomped by a later track-changed event for the same stream', () => {
        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng'), makeTrack('1', 'Nederlands', 'nld')],
            subtitles: [],
        });
        sync(fake.access);

        setValue(PLAYER_ACTIVE, channel('a', 'http://provider.test/a.ts'));
        tick();
        fake.fireTracksChanged();
        tick();
        expect(fake.audioCalls).toEqual(['0']); // auto-applied to English

        setAudioTrack('1'); // viewer manually overrides to Nederlands via the menu
        tick();
        expect(fake.audioCalls).toEqual(['0', '1']);

        // A late-arriving update for the SAME stream must not undo the
        // manual pick.
        fake.fireTracksChanged();
        tick();
        expect(fake.audioCalls).toEqual(['0', '1']);
    });

    it('player.trackMenu and the published lists reset the instant the stream changes, before any new tracks arrive', () => {
        const fake = makeFakeEngine({
            audio: [makeTrack('0', 'English', 'eng', true)],
            subtitles: [],
        });
        sync(fake.access);

        setValue(PLAYER_ACTIVE, channel('a', 'http://provider.test/a.ts'));
        tick();
        toggleAudioMenu();
        tick();
        expect(get<string>(PLAYER_TRACK_MENU)).toBe('audio');

        setValue(PLAYER_ACTIVE, channel('b', 'http://provider.test/b.ts'));
        tick();

        expect(get<string>(PLAYER_TRACK_MENU)).toBe('none');
        expect(get<MediaTrack[]>(PLAYER_AUDIO_TRACKS)).toEqual([]);
    });
});
