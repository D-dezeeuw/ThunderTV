import type { TrackSnapshot } from './tracks';

/**
 * Capability surface an attached playback engine can optionally expose.
 *
 * There is no shared attach/destroy object model in this codebase yet —
 * mpegts.js/hls.js/native are each driven procedurally by `engine.ts`'s
 * `attemptChain()`/`runCurrentAttempt()`, not as instances of a common
 * class — so this interface doesn't attempt to describe that lifecycle.
 * Track control is the first capability more than one of those engines
 * needs to expose the *same way* to a caller outside `engine.ts`, so it
 * gets its own narrow, all-optional contract: every member is optional so
 * an engine that supports none of this (mpegts.js has no track switching)
 * or only part of it (the native fallback has subtitles but audio only on
 * Safari) is still a valid `PlayerEngine` without stub implementations.
 *
 * `engine.ts` holds one `PlayerEngine` per attach attempt (built the moment
 * that attempt starts, torn down alongside it) and dispatches
 * `getPlayerTracks()`/`setAudioTrack()`/`setSubtitleTrack()`/
 * `onTracksChanged()` to whichever is current.
 */
export interface PlayerEngine {
    /** Current audio/subtitle track lists. Omitted (or returning the empty snapshot) means the engine has no track info to offer. */
    getTracks?(): TrackSnapshot;
    /** Switch the active audio track by its `MediaTrack.id`. */
    setAudioTrack?(id: string): void;
    /** Switch the active subtitle track by its `MediaTrack.id`; `null` turns subtitles off. */
    setSubtitleTrack?(id: string | null): void;
    /** Registers the callback fired when the track lists become available or change. Single-listener — a new call replaces the previous callback, it does not add a second one. */
    onTracksChanged?(cb: () => void): void;
}
