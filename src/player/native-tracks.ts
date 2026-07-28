import type { PlayerEngine } from './player-engine';
import type { MediaTrack, TrackSnapshot } from './tracks';

/** The subset of a track object `mapAudioTracks`/`mapTextTracks` reads — kept structural so both are testable with plain object literals. */
export interface AudioTrackLike {
    label: string;
    language: string;
    enabled: boolean;
}

export interface TextTrackLike {
    kind: string;
    label: string;
    language: string;
    mode: string;
}

/** Safari's non-standard `HTMLMediaElement.audioTracks` extension — absent from TS's DOM lib, so declared locally as the minimal shape this module reads/writes. Real `AudioTrackList`/`AudioTrack` satisfy this structurally. */
interface SafariAudioTrackList extends EventTarget {
    readonly length: number;
    [index: number]: AudioTrackLike;
}
interface VideoWithAudioTracks extends HTMLVideoElement {
    audioTracks?: SafariAudioTrackList;
}

function audioTrackListOf(video: HTMLVideoElement): SafariAudioTrackList | undefined {
    return (video as VideoWithAudioTracks).audioTracks;
}

/** `id` = the track's index in the source list — callers pass that same index back to switch tracks. */
export function mapAudioTracks(tracks: ArrayLike<AudioTrackLike>): MediaTrack[] {
    const result: MediaTrack[] = [];
    for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (!track) continue;
        const lang = track.language;
        result.push({
            id: String(index),
            label: track.label || lang || `Track ${String(index + 1)}`,
            lang,
            active: track.enabled,
        });
    }
    return result;
}

/** Subtitle-eligible (`subtitles`/`captions`) entries of `video.textTracks`; `id` is the track's real index in that list, not its position among subtitle-eligible entries, so `setSubtitleTrack` can look it back up directly. */
export function mapTextTracks(tracks: ArrayLike<TextTrackLike>): MediaTrack[] {
    const result: MediaTrack[] = [];
    for (let index = 0; index < tracks.length; index += 1) {
        const track = tracks[index];
        if (!track || (track.kind !== 'subtitles' && track.kind !== 'captions')) continue;
        const lang = track.language;
        result.push({
            id: String(index),
            label: track.label || lang || `Track ${String(index + 1)}`,
            lang,
            active: track.mode === 'showing',
        });
    }
    return result;
}

/** `addEventListener`/`removeEventListener` if the target actually has them — jsdom's test stand-ins for `textTracks`/`audioTracks` are plain arrays without them, and real engines must not throw over that. */
function safeListen(target: EventTarget | undefined, type: string, cb: () => void, add: boolean): void {
    if (!target) return;
    if (add) {
        if (typeof target.addEventListener === 'function') target.addEventListener(type, cb);
    } else if (typeof target.removeEventListener === 'function') {
        target.removeEventListener(type, cb);
    }
}

/**
 * Native fallback `PlayerEngine`: audio switching only where the browser
 * exposes Safari's `audioTracks` extension; subtitles via the standard
 * `textTracks` API every engine feeding this `<video>` shares. Absent APIs
 * mean an always-empty snapshot — feature-detected and expected, not a bug.
 */
export function createNativeTrackEngine(video: HTMLVideoElement): { engine: PlayerEngine; dispose: () => void } {
    const audioTracks = audioTrackListOf(video);
    const textTracks = video.textTracks;
    let listener: (() => void) | null = null;
    const fire = (): void => listener?.();

    const engine: PlayerEngine = {
        getTracks(): TrackSnapshot {
            return {
                audio: audioTracks ? mapAudioTracks(audioTracks) : [],
                subtitles: mapTextTracks(textTracks),
            };
        },
        setAudioTrack(id: string): void {
            if (!audioTracks) return;
            const index = Number(id);
            for (let i = 0; i < audioTracks.length; i += 1) {
                const track = audioTracks[i];
                if (track) track.enabled = i === index;
            }
        },
        setSubtitleTrack(id: string | null): void {
            const index = id === null ? -1 : Number(id);
            for (let i = 0; i < textTracks.length; i += 1) {
                const track = textTracks[i];
                if (!track || (track.kind !== 'subtitles' && track.kind !== 'captions')) continue;
                track.mode = i === index ? 'showing' : 'disabled';
            }
        },
        onTracksChanged(cb: () => void): void {
            listener = cb;
        },
    };

    safeListen(audioTracks, 'addtrack', fire, true);
    safeListen(audioTracks, 'change', fire, true);
    safeListen(textTracks, 'addtrack', fire, true);
    safeListen(textTracks, 'change', fire, true);

    return {
        engine,
        dispose(): void {
            safeListen(audioTracks, 'addtrack', fire, false);
            safeListen(audioTracks, 'change', fire, false);
            safeListen(textTracks, 'addtrack', fire, false);
            safeListen(textTracks, 'change', fire, false);
        },
    };
}
