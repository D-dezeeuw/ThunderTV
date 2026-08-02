/**
 * Player-bar copy that no longer fits in `strings.<locale>.ts`: the
 * dock/theater audio/subtitle track menus, and the audio-only TV switch.
 * Split out because those files sit on ESLint's 400-line hard ceiling, the
 * same "split into its own file, merge via one spread" precedent
 * `strings.en.catalog.ts`/`src/state/registry-overflow.ts` already
 * established for the identical problem — every new player-bar string
 * belongs here now, in all three locales. Spread *inside* the locale file's
 * own `list: { … }` object
 * (`list.audioTracksLabel` etc. — matching every other player-bar string
 * already living there, e.g. `playerFullscreen`/`signalGood`), not as a
 * second top-level `list` key: `list` already exists in `strings.en.ts`,
 * and two `list` keys in one object literal would silently resolve to
 * whichever comes last (JS's duplicate-property rule replaces rather than
 * merges), discarding whichever spread lost.
 */
export const enPlayerTracks = {
    audioTracksLabel: 'Audio tracks',
    subtitlesLabel: 'Subtitles',
    subtitlesOff: 'Off',
    noAudioTracks: 'No audio tracks in this stream',
    noSubtitles: "No subtitles in this stream — subtitles baked into a movie file can't be read by a browser, so load one below",
    /** Opens the file picker for a .srt/.vtt sitting next to the film — the only subtitle route that works for a progressive VOD file, whatever the provider ships. */
    subtitlesLoadFile: 'Load subtitle file…',
    subtitlesLoadFailed: 'That subtitle file could not be read.',
    /** Switches a TV channel to Radio's audio + visualizer presentation, and back. */
    playerAudioOnly: 'Audio only',
    playerShowPicture: 'Show picture',
    /** Accessible name for the preview pane itself, which toggles playback when tapped. */
    playerTogglePlayback: 'Play or pause',
    /** Appended to the MediaError label when a movie/episode file uses a container this device has no decoder for — MKV most often, which Chromium does not support at all. */
    playerUnsupportedContainer:
        "this file's container is not one this device can play; downloading it and opening it in another player will work",
    /** The last engine in the chain went quiet: no metadata, no frames, and no error either. Reported so the player says something instead of spinning indefinitely. */
    playerNoDataYet: 'no playable data after 20 seconds',
    /** The picture runs and the audio track never decodes a byte — `src/player/audio-output.ts`. Named codecs on purpose: "no sound" sends a viewer hunting for a mute button, "AC-3" sends them to a different copy of the film. */
    playerNoAudioDecoded:
        "No sound — this device has no decoder for this file's audio (Dolby Digital/AC-3, E-AC-3 and DTS are the usual cause). The picture plays normally.",
    /** The desktop answer to the same finding: the film restarts through the bundled ffmpeg with its audio re-encoded (`src/player/transcode-fallback.ts`). Shown only for the few seconds that restart takes. */
    playerTranscodingAudio: "Restoring sound — converting this file's audio…",
    /** Both halves of what happened, because the fallback is the file playing silently again rather than nothing at all. */
    playerNoAudioDecodedTranscodeFailed:
        "No sound — this device has no decoder for this file's audio (Dolby Digital/AC-3, E-AC-3 and DTS are the usual cause), and converting it here failed too. The picture plays normally.",
} as const;
