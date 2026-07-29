/**
 * Track types shared by the playback engines and the (later) state/UI layer
 * that lets a viewer pick an audio dub or subtitle language. Kept
 * engine-agnostic: a `MediaTrack` is just what's selectable, not how any one
 * engine represents it internally — `PlayerEngine.getTracks()`
 * (`player-engine.ts`) is what maps an engine's own track objects to these.
 */

/** One selectable audio or subtitle track. `lang` is `''` when the source didn't say. */
export interface MediaTrack {
    /** Stable within one attach — engines use the track's index in their own list. */
    id: string;
    /** Human-readable name; falls back to `lang`, then `'Track N'`, when the source gives no name. */
    label: string;
    /** Best-effort normalized-ish language as the engine reported it (raw — see `track-prefs.ts` for canonicalizing this for comparison). `''` when unknown. */
    lang: string;
    active: boolean;
}

/** The current audio/subtitle track listing for whichever engine is attached. */
export interface TrackSnapshot {
    audio: MediaTrack[];
    subtitles: MediaTrack[];
}
