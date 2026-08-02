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
    noSubtitles:
        'Keine Untertitel in diesem Stream — in eine Filmdatei eingebettete Untertitel kann ein Browser nicht lesen, laden Sie sie unten',
    subtitlesLoadFile: 'Untertiteldatei laden…',
    subtitlesLoadFailed: 'Diese Untertiteldatei konnte nicht gelesen werden.',
    playerAudioOnly: 'Nur Ton',
    playerShowPicture: 'Bild anzeigen',
    playerTogglePlayback: 'Abspielen oder pausieren',
    playerUnsupportedContainer:
        'den Container dieser Datei kann dieses Gerät nicht abspielen; laden Sie sie herunter und öffnen Sie sie in einem anderen Player',
    playerNoDataYet: 'nach 20 Sekunden noch keine abspielbaren Daten',
    playerNoAudioDecoded:
        'Kein Ton — dieses Gerät hat keinen Decoder für den Ton dieser Datei (meist Dolby Digital/AC-3, E-AC-3 oder DTS). Das Bild läuft normal weiter.',
} as const;
