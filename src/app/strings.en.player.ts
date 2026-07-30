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
 * already living there, e.g. `playerStop`/`nowPlayingEmpty`), not as a
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
    noSubtitles: 'No subtitles in this stream',
    /** Switches a TV channel to Radio's audio + visualizer presentation, and back. */
    playerAudioOnly: 'Audio only',
    playerShowPicture: 'Show picture',
    /** The Stop/Play toggle's label while paused — resumes in place rather than closing the channel. */
    playerResume: 'Play',
    /** Accessible name for the preview pane itself, which toggles playback when tapped. */
    playerTogglePlayback: 'Play or pause',
    /** Appended to the MediaError label when a movie/episode file uses a container this device has no decoder for — MKV most often, which Chromium does not support at all. */
    playerUnsupportedContainer:
        "this file's container is not one this device can play; downloading it and opening it in another player will work",
    /** The last engine in the chain went quiet: no metadata, no frames, and no error either. Reported so the player says something instead of spinning indefinitely. */
    playerNoDataYet: 'no playable data after 20 seconds',
} as const;
