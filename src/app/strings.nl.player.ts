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
    subtitlesSearchOnline: 'Ondertitels online zoeken',
    subtitlesOnlineSearching: 'Zoeken…',
    subtitlesOnlineDownloading: 'Downloaden…',
    subtitlesOnlineMatchedTemplate: 'Beste match: {title}',
    subtitlesOnlineNone: 'Geen ondertitels gevonden voor deze titel.',
    subtitlesOnlineUnidentified: 'Deze titel kon niet worden herkend, dus er valt niets te zoeken.',
    subtitlesOnlineUnreachable: 'De ondertiteldienst is vanaf dit apparaat niet bereikbaar.',
    subtitlesOnlineTimeout: 'De ondertiteldienst deed er te lang over. Probeer het opnieuw.',
    subtitlesOnlineAttachFailed: 'Die ondertitel kon niet worden gebruikt.',
    subtitlesOnlineProvider: 'OpenSubtitles',
    subtitlesOnlineCachedLabel: 'Bewaarde ondertitel',
    subtitlesOnlineCached: 'De bewaarde ondertitel voor deze titel wordt gebruikt. Druk nogmaals om een andere te zoeken.',
    playerAudioOnly: 'Alleen geluid',
    playerShowPicture: 'Beeld tonen',
    playerTogglePlayback: 'Afspelen of pauzeren',
    playerClose: 'Stoppen en voorbeeld sluiten',
    playerUnsupportedContainer:
        'dit apparaat kan de container van dit bestand niet afspelen; download het en open het in een andere speler',
    playerNoDataYet: 'na 20 seconden nog geen afspeelbare gegevens',
    playerNoAudioDecoded:
        'Geen geluid — dit apparaat heeft geen decoder voor de audio van dit bestand (meestal Dolby Digital/AC-3, E-AC-3 of DTS). Het beeld speelt gewoon door.',
    playerTranscodingAudio: 'Geluid herstellen — audio van dit bestand wordt omgezet…',
    playerNoAudioDecodedTranscodeFailed:
        'Geen geluid — dit apparaat heeft geen decoder voor de audio van dit bestand (meestal Dolby Digital/AC-3, E-AC-3 of DTS) en omzetten lukte hier ook niet. Het beeld speelt gewoon door.',
} as const;
