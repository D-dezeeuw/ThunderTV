/** Phase 31 EPG country-catalog copy — see `strings.en.epg.ts` for why this is a separate file. */
export const deEpg = {
    live: {
        epgFellBack:
            'Der EPG-Katalog hat hier noch nichts zugeordnet, alle Sender werden angezeigt. Programmdaten in den Einstellungen abrufen oder aktualisieren, oder das gewählte Land prüfen.',
    },
    diagnostics: {
        epgCatalogReadout: 'EPG-Katalog: bekannte Sender',
        epgMatchedReadout: '· zugeordnet zu Ihrer Liste:',
        refreshEpgButton: 'Programmdaten jetzt aktualisieren',
        refreshEpgHelp:
            'Ruft den EPG-Länderkatalog und die Programmdaten erneut ab, ohne den normalen Aktualisierungsplan abzuwarten — nützlich nach einem Länderwechsel oder wenn ein erwarteter Sender noch immer nicht zugeordnet wird.',
        clearEpgCacheButton: 'EPG-Cache leeren',
        clearEpgCacheHelp:
            'Löscht den gespeicherten EPG-Katalog, die Programmdaten und die Zuordnung für das gewählte Land und baut sie danach komplett neu auf. Nützlich, wenn der Guide auf veralteten Daten hängen bleibt — diese Daten überstehen ein normales Neuladen absichtlich, dies ist also der manuelle Reset.',
        epgCacheDone: 'Fertig.',
        epgCacheFailed: 'Etwas ist schiefgelaufen — versuchen Sie es gleich noch einmal.',
    },
    liveFilter: {
        epgVerifiedOnly: 'Nur EPG-geprüfte Sender',
        epgVerifiedOnlyHelp:
            'Standardmäßig aus: Ein Sender, den der EPG-Katalog noch nicht zugeordnet hat, ist weit häufiger eine Lücke in den Programmdaten als ein nicht existierender Sender. Aktivieren, sobald Ihr Katalog gefüllt ist, um Sender ohne Programmdaten auszublenden. Gilt nie für Radio.',
    },
    playback: {
        hideNoAudioTitles: 'Titel ohne Ton auf diesem Gerät ausblenden',
        hideNoAudioTitlesHelp:
            'Blendet nur Titel aus, die dieses Gerät bereits ohne Ton abgespielt hat (und auf dem Desktop auch nicht umwandeln konnte). Standardmäßig aus \u2014 der Hinweis auf der Detailseite bleibt immer sichtbar.',
        showHandoffButton: 'Schaltfläche "Auf anderem Gerät fortsetzen" anzeigen',
        showHandoffButtonHelp: 'Fügt der Player-Leiste eine Schaltfläche hinzu, um den aktuellen Stream an ein anderes Gerät zu übergeben. Standardmäßig aus.',
    },
    list: {
        streamLikelyDead: 'Dieser Feed ist zuletzt meistens fehlgeschlagen. Er kann trotzdem funktionieren — dies ist eine Schätzung aus Ihrem eigenen Wiedergabeverlauf.',
    },
    /** Complete top-level blocks, spread as one line into `strings.<locale>.ts` — that file has no room left for a nested block of its own. */
    topLevel: {
        guide: {
            nowLabel: 'Jetzt',
            noDescription: 'Keine Beschreibung für diese Sendung verfügbar.',
            watchChannel: 'Diesen Sender ansehen',
            earlier: 'Früher',
            later: 'Später',
            backToNow: 'Zurück zu jetzt',
            playChannel: 'Diesen Sender abspielen',
        },
        health: {
            sectionTitle: 'Streamqualität',
            readout: 'Feeds mit Wiedergabeverlauf:',
            deadReadout: '· vermutlich tot:',
            clearButton: 'Streamqualität vergessen',
            clearHelp:
                'Löscht alles, was ThunderTV darüber gelernt hat, welche Feeds abspielen und welche fehlschlagen. Aufgezeichnet wird nur Ihre eigene Wiedergabe, und von jeder URL nur ein Fingerabdruck ohne Zugangsdaten — nie Ihr Benutzername oder Passwort.',
            cleared: 'Streamqualität vergessen.',
        },
    },
} as const;
