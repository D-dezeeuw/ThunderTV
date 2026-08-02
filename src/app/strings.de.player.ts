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
    subtitlesSearchOnline: 'Untertitel online suchen',
    subtitlesOnlineSearching: 'Wird gesucht…',
    subtitlesOnlineDownloading: 'Wird heruntergeladen…',
    subtitlesOnlineMatchedTemplate: 'Beste Übereinstimmung: {title}',
    subtitlesOnlineNone: 'Für diesen Titel wurden keine Untertitel gefunden.',
    subtitlesOnlineUnidentified: 'Dieser Titel konnte nicht erkannt werden, es gibt also nichts zu suchen.',
    subtitlesOnlineUnreachable: 'Der Untertiteldienst ist von diesem Gerät aus nicht erreichbar.',
    subtitlesOnlineTimeout: 'Der Untertiteldienst hat zu lange gebraucht. Bitte erneut versuchen.',
    subtitlesOnlineAttachFailed: 'Dieser Untertitel konnte nicht verwendet werden.',
    subtitlesOnlineProvider: 'OpenSubtitles',
    subtitlesOnlineCachedLabel: 'Gespeicherter Untertitel',
    subtitlesOnlineCached: 'Der für diesen Titel gespeicherte Untertitel wird verwendet. Erneut drücken, um einen anderen zu suchen.',
    playerAudioOnly: 'Nur Ton',
    playerShowPicture: 'Bild anzeigen',
    playerTogglePlayback: 'Abspielen oder pausieren',
    playerUnsupportedContainer:
        'den Container dieser Datei kann dieses Gerät nicht abspielen; laden Sie sie herunter und öffnen Sie sie in einem anderen Player',
    playerNoDataYet: 'nach 20 Sekunden noch keine abspielbaren Daten',
    playerNoAudioDecoded:
        'Kein Ton — dieses Gerät hat keinen Decoder für den Ton dieser Datei (meist Dolby Digital/AC-3, E-AC-3 oder DTS). Das Bild läuft normal weiter.',
    playerTranscodingAudio: 'Ton wird wiederhergestellt — die Tonspur wird umgewandelt…',
    playerNoAudioDecodedTranscodeFailed:
        'Kein Ton — dieses Gerät hat keinen Decoder für den Ton dieser Datei (meist Dolby Digital/AC-3, E-AC-3 oder DTS), und das Umwandeln ist hier ebenfalls fehlgeschlagen. Das Bild läuft normal weiter.',
} as const;
