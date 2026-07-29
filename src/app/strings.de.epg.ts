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
    guide: {
        earlier: 'Früher',
        later: 'Später',
        backToNow: 'Zurück zu jetzt',
        playChannel: 'Diesen Sender abspielen',
    },
    list: {
        epgNextPrefix: 'Danach ·',
    },
} as const;
