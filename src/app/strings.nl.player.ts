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
    noSubtitles:
        'Geen ondertitels in deze stream — ondertitels in een filmbestand kan een browser niet lezen, laad ze hieronder',
    subtitlesLoadFile: 'Ondertitelbestand laden…',
    subtitlesLoadFailed: 'Dat ondertitelbestand kon niet worden gelezen.',
    playerAudioOnly: 'Alleen geluid',
    playerShowPicture: 'Beeld tonen',
    playerTogglePlayback: 'Afspelen of pauzeren',
    playerUnsupportedContainer:
        'dit apparaat kan de container van dit bestand niet afspelen; download het en open het in een andere speler',
    playerNoDataYet: 'na 20 seconden nog geen afspeelbare gegevens',
    playerNoAudioDecoded:
        'Geen geluid — dit apparaat heeft geen decoder voor de audio van dit bestand (meestal Dolby Digital/AC-3, E-AC-3 of DTS). Het beeld speelt gewoon door.',
} as const;
