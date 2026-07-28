/**
 * Dutch half of the player-bar copy split — see `strings.en.player.ts` for
 * why this lives outside `strings.nl.ts` (that file is on ESLint's 400-line
 * hard ceiling) and why the spread goes *inside* its `list: { … }` object
 * rather than beside it.
 */
export const nlPlayerTracks = {
    audioTracksLabel: 'Audiotracks',
    subtitlesLabel: 'Ondertitels',
    subtitlesOff: 'Uit',
    noAudioTracks: 'Geen audiotracks in deze stream',
    noSubtitles: 'Geen ondertitels in deze stream',
    playerAudioOnly: 'Alleen geluid',
    playerShowPicture: 'Beeld tonen',
} as const;
