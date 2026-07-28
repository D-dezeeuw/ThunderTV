/**
 * German half of the player-bar copy split — see `strings.en.player.ts` for
 * why this lives outside `strings.de.ts` (that file is on ESLint's 400-line
 * hard ceiling) and why the spread goes *inside* its `list: { … }` object
 * rather than beside it.
 */
export const dePlayerTracks = {
    audioTracksLabel: 'Audiospuren',
    subtitlesLabel: 'Untertitel',
    subtitlesOff: 'Aus',
    noAudioTracks: 'Keine Audiospuren in diesem Stream',
    noSubtitles: 'Keine Untertitel in diesem Stream',
    playerAudioOnly: 'Nur Ton',
    playerShowPicture: 'Bild anzeigen',
} as const;
