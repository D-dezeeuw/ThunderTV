import type Hls from 'hls.js';
import type { PlayerEngine } from './player-engine';
import type { MediaTrack, TrackSnapshot } from './tracks';

/**
 * The subset of hls.js's `MediaPlaylist` a track list needs — kept
 * structural (rather than importing hls.js's real type) so `mapHlsTracks`
 * is testable with plain object literals, no hls.js involved. Real
 * `MediaPlaylist[]` values (`hls.audioTracks`/`hls.subtitleTracks`) satisfy
 * this structurally.
 */
export interface HlsTrackLike {
    name?: string;
    lang?: string;
}

/**
 * Maps `hls.audioTracks`/`hls.subtitleTracks` to `MediaTrack[]`.
 * `activeIndex` is `hls.audioTrack`/`hls.subtitleTrack` — for subtitles
 * that's `-1` when off, which naturally marks every entry inactive since no
 * real track index is `-1`.
 */
export function mapHlsTracks(tracks: readonly HlsTrackLike[], activeIndex: number): MediaTrack[] {
    return tracks.map((track, index) => {
        const lang = track.lang ?? '';
        return {
            id: String(index),
            label: track.name || lang || `Track ${String(index + 1)}`,
            lang,
            active: index === activeIndex,
        };
    });
}

/**
 * Builds the hls.js `PlayerEngine`. `engine.ts` already holds the
 * dynamically-imported `HlsCtor` (needed to reference `Hls.Events.*`
 * symbolically, matching its existing style) at the one call site that
 * constructs this, so track-changed notifications are driven from there:
 * this just hands back the trigger function to wire to
 * `AUDIO_TRACKS_UPDATED`/`SUBTITLE_TRACKS_UPDATED`/`MANIFEST_PARSED`,
 * rather than this module taking a second, static import of hls.js itself
 * (which would defeat `engine.ts`'s lazy `import('hls.js')`).
 */
export function createHlsTrackEngine(instance: Hls): { engine: PlayerEngine; notifyTracksChanged: () => void } {
    let listener: (() => void) | null = null;

    const engine: PlayerEngine = {
        getTracks(): TrackSnapshot {
            return {
                audio: mapHlsTracks(instance.audioTracks, instance.audioTrack),
                subtitles: mapHlsTracks(instance.subtitleTracks, instance.subtitleTrack),
            };
        },
        setAudioTrack(id: string): void {
            const index = Number(id);
            if (!Number.isNaN(index)) instance.audioTrack = index;
        },
        setSubtitleTrack(id: string | null): void {
            if (id === null) {
                instance.subtitleTrack = -1;
                instance.subtitleDisplay = false;
                return;
            }
            const index = Number(id);
            if (!Number.isNaN(index)) {
                instance.subtitleTrack = index;
                instance.subtitleDisplay = true;
            }
        },
        onTracksChanged(cb: () => void): void {
            listener = cb;
        },
    };

    return {
        engine,
        notifyTracksChanged: (): void => listener?.(),
    };
}
