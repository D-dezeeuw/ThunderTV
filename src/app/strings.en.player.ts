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
    /** The manual online search (`src/core/subtitles/`). Movies and episodes only — a live channel has no title to look up. */
    subtitlesSearchOnline: 'Search subtitles online',
    subtitlesOnlineSearching: 'Searching…',
    subtitlesOnlineDownloading: 'Downloading…',
    /** Shown above the results when the title was matched by name rather than by a provider-supplied IMDb id, so a wrong match is visible before the cues are. */
    subtitlesOnlineMatchedTemplate: 'Best match: {title}',
    subtitlesOnlineNone: 'No subtitles found for this title.',
    subtitlesOnlineUnidentified: "This title couldn't be identified, so there is nothing to search for.",
    subtitlesOnlineUnreachable: 'The subtitle service could not be reached from this device.',
    subtitlesOnlineTimeout: 'The subtitle service took too long to answer. Try again.',
    subtitlesOnlineAttachFailed: 'That subtitle could not be used.',
    /** Row label prefix — the service publishes a language and an id, never a release name, so the rows are numbered. */
    subtitlesOnlineProvider: 'OpenSubtitles',
    subtitlesOnlineCachedLabel: 'Saved subtitle',
    subtitlesOnlineCached: 'Using the subtitle saved for this title. Press again to search for another.',
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
