/**
 * Dock/theater audio/subtitle track-menu copy (final audio/subtitle stage),
 * split out of `strings.en.ts` — that file was pushed over ESLint's
 * 400-line hard ceiling by this addition, the same "split into its own
 * file, merge via one spread" precedent `strings.en.catalog.ts`/
 * `src/state/registry-catalog.ts` already established for the identical
 * problem. Spread *inside* `strings.en.ts`'s own `list: { … }` object
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
} as const;
