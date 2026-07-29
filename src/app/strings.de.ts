/**
 * German copy. Mirrors `strings.en.ts`'s exact key shape (`strings.spec.ts` asserts it).
 * Proper nouns and technical acronyms (M3U, EPG, Xtream Codes, CORS, HLS, DRM) stay untranslated.
 */
import { deCatalog } from './strings.de.catalog';
import { deCodex } from './strings.de.codex';
import { deEpg } from './strings.de.epg';
import { dePlayerTracks } from './strings.de.player';

export const de = {
    appName: 'ThunderTV',

    rail: {
        live: 'Live',
        radio: 'Radio',
        movies: 'Filme',
        series: 'Serien',
        categories: 'Kategorien',
        sources: 'Quellen',
        favorites: 'Favoriten',
        recent: 'Zuletzt',
        guide: 'Guide',
        settings: 'Einstellungen',
    },

    views: {
        live: { title: 'Live', heading: 'Live' },
        radio: { title: 'Radio', heading: 'Radio' },
        movies: { title: 'Filme', heading: 'Filme' },
        series: { title: 'Serien', heading: 'Serien' },
        categories: { title: 'Kategorien', heading: 'Kategorien' },
        sources: { title: 'Quellen', heading: 'Quellen' },
        favorites: { title: 'Favoriten', heading: 'Favoriten' },
        recent: { title: 'Zuletzt', heading: 'Zuletzt' },
        guide: { title: 'Guide', heading: 'Guide' },
        connect: { title: 'Verbinden', heading: 'Verbinden' },
    },

    ...deCatalog,

    live: {
        channelsLabel: 'Sender insgesamt',
        statsTitle: 'Live-Filter: Varianten gruppiert und nicht passende Zeilen ausgeblendet',
        empty: {
            heading: 'Keine Sender entsprechen dem Live-Filter',
            message:
                'Ihr Anbieter benennt Sender möglicherweise anders. Probieren Sie ein anderes Land, deaktivieren Sie "Nur bekannte Sender", oder durchsuchen Sie den unveränderten Katalog unter Kategorien.',
            openCategories: 'Alle Kategorien durchsuchen',
            openSources: 'Quelle hinzufügen',
        },
        variants: {
            label: 'Weitere Feeds',
            catchUp: 'Catch-up',
            alt: 'Alt',
        },
        strictFellBack: 'Die kuratierte Liste hat hier nichts gefunden, alle Sender werden angezeigt. Gefundene Namen:',
        ...deEpg.live,
    },
    debug: {
        title: 'Debug',
        open: 'Debug-Panel öffnen',
        openHelp:
            'Zeigt erfasste Fehler und den zugehörigen Listenstatus. Öffnet sich auch mit Strg/Cmd+Umschalt+D — nützlich, wenn eine Ansicht leer ist und der Rest der Oberfläche nicht erreichbar ist.',
        close: 'Debug-Panel schließen',
        refresh: 'Aktualisieren',
        copy: 'Bericht kopieren',
        clear: 'Protokoll löschen',
        logTitle: 'Erfasstes Protokoll',
        logEmpty: 'Noch nichts erfasst.',
        errorsLabel: 'Fehler',
        facts: {
            view: 'Aktive Ansicht',
            sources: 'Gespeicherte Quellen',
            activeId: 'ID der aktiven Quelle',
            activeResolved: 'Wird aufgelöst zu',
            rowsInMemory: 'Senderzeilen im Speicher',
            liveChannels: 'Live-Sender nach Filter',
            radioCount: 'Radiosender',
            storage: 'Speicherebene',
            platform: 'Plattform',
        },
    },

    categories: {
        note: 'Jede Kategorie und jeder Sender genau so, wie Ihr Anbieter sie liefert — ungefiltert und ungruppiert.',
    },

    radio: {
        note: 'Reine Audiosender aus dieser Quelle. Radio hat keinen EPG und keine kuratierte Liste, daher gelten nur Land- und Störfilterung.',
        empty: 'Keine Radiosender in dieser Quelle gefunden',
        emptyHint:
            'Ihr Anbieter liefert keine reinen Audiosender, oder benennt sie auf eine Weise, die diese Liste nicht erkannt hat — der unveränderte Katalog unter Kategorien zeigt alles, was gesendet wurde.',
    },

    emptyStates: {
        firstRun: {
            heading: 'Fügen Sie eine Quelle hinzu, um loszulegen',
            note: 'Oder öffnen Sie einen Verbindungslink, um dieses Gerät in einem Schritt zu konfigurieren.',
            file: 'M3U-Datei hochladen',
            urlPlaceholder: 'https://anbieter.beispiel/playlist.m3u',
            urlSubmit: 'Von URL importieren',
            pastePlaceholder: 'Fügen Sie hier Ihre M3U-Playlist ein…',
            pasteSubmit: 'Eingefügten Text importieren',
            xtream: 'Xtream Codes hinzufügen',
            xtreamComingSoon: 'Xtream Codes — demnächst verfügbar',
            xtreamUrlPlaceholder: 'http://anbieter.beispiel:8080',
            xtreamUserPlaceholder: 'Benutzername',
            xtreamPassPlaceholder: 'Passwort',
            xtreamSubmit: 'Verbinden',
            corsHint:
                'Browsersicherheit (CORS) blockiert bei den meisten Anbietern einen direkten URL-Import — Datei-Upload funktioniert immer, und der URL-Import schlägt bei Blockierung einen Proxy vor.',
        },
        demoRowsLabel: 'Dichtevorschau (Beispielzeilen — noch keine echten Sender)',
        favorites: {
            heading: 'Noch keine Favoriten',
            message: 'Sender, die Sie favorisieren, erscheinen hier.',
        },
        recent: {
            heading: 'Noch nichts angesehen',
            message: 'Sender, die Sie abspielen, erscheinen hier.',
        },
        guide: {
            heading: 'Noch keine EPG-Daten',
            message: 'Der Programmführer wird noch abgerufen, oder es wurde noch nichts Ihren Sendern zugeordnet — schauen Sie später noch einmal vorbei.',
        },
        error: {
            heading: 'Etwas ist schiefgelaufen',
            retry: 'Erneut versuchen',
        },
    },

    connect: {
        detected: 'Verbindungslink erkannt — dieses Gerät wird in Kürze konfiguriert.',
    },

    ...deEpg.topLevel,
    ...deCodex,

    recent: {
        nowPlaying: 'Läuft gerade:',
        playTitle: 'Abspielen',
        radioBadge: 'Radio',
    },

    storageNotice: {
        partial: 'Der Speicher auf diesem Gerät ist begrenzt — Playlists werden beim Start neu geladen.',
        none: 'Auf diesem Gerät bleibt nichts erhalten — Importe gelten nur für diese Sitzung.',
        dismiss: 'Schließen',
        learnMore: 'Mehr erfahren',
        userSectionTier: 'Speicher',
    },

    http: {
        failure: {
            httpAuth: 'Diese URL erfordert Anmeldedaten, oder der Zugriff wurde blockiert (401/403).',
            httpNotFound: 'Unter dieser URL wurde nichts gefunden — bitte überprüfen (404).',
            httpServer: 'Der Anbieter hat gerade Probleme — bitte später erneut versuchen (5xx).',
            httpOther: 'Der Anbieter hat mit einem Fehler geantwortet.',
            timeout: 'Der Anbieter hat zu lange nicht geantwortet, die Anfrage ist abgelaufen.',
            corsOrNetwork:
                'Der Server dieses Anbieters hat die Anfrage blockiert, oder es ist ein Netzwerkfehler aufgetreten. Anbieter erlauben selten direkten Browserzugriff (CORS) — versuchen Sie, die Playlist-Datei herunterzuladen und hochzuladen, oder konfigurieren Sie einen Proxy unter Einstellungen → Streaming.',
            offline: 'Dieses Gerät scheint offline zu sein. Überprüfen Sie die Netzwerkverbindung und versuchen Sie es erneut.',
            mixedContent:
                'Diese Playlist verwendet eine unverschlüsselte (http://) Adresse, die Browser auf einer sicheren (https://) Seite blockieren. Konfigurieren Sie einen Proxy unter Einstellungen → Streaming, oder verwenden Sie die Desktop-App, die diese Einschränkung nicht hat.',
            tooLarge: 'Dies ist größer als erwartet und wurde zum Schutz des Speichers gestoppt.',
            xtreamCorsOrNetwork:
                'Der Anbieter hat diese Anfrage blockiert, oder es ist ein Netzwerkfehler aufgetreten. Die meisten Xtream-Anbieter erlauben keinen direkten Browserzugriff (CORS) — konfigurieren Sie einen Proxy unter Einstellungen → Streaming und überprüfen Sie die Serveradresse erneut.',
            xtreamMixedContent:
                'Dieser Anbieter verwendet eine unverschlüsselte (http://) Adresse, die Browser auf einer sicheren (https://) Seite blockieren. Konfigurieren Sie einen Proxy unter Einstellungen → Streaming, oder verwenden Sie die Desktop-App, die diese Einschränkung nicht hat.',
        },
        proxy: {
            invalidTemplate: 'Die Proxy-Adresse muss mit https:// beginnen (oder http://localhost zum lokalen Testen).',
            credentialWarning:
                'Anfragen, die über einen Proxy laufen — einschließlich Xtream Codes-Anmeldedaten in der URL — sind für den Betreiber dieses Proxys sichtbar. Verwenden Sie nur einen Proxy, dem Sie vertrauen.',
        },
    },

    sourcesAdmin: {
        hiddenNote: 'In der Seitenleiste ausgeblendet, da keine abspielbaren Sender enthalten sind. Hier weiterhin auswählbar.',
        showHidden: 'Ausgeblendete Quellen anzeigen',
        allTitle: 'Standardquelle',
        allHint: 'Wählen Sie, welche importierte Quelle Live, Radio und Kategorien anzeigen. Die Auswahl hier bewirkt dasselbe wie die Auswahl im Tab Quellen.',
        activeBadge: 'Aktiv',
    },

    settings: {
        title: 'Einstellungen',
        close: 'Einstellungen schließen',
        sections: {
            user: 'Benutzer',
            diagnostics: 'Diagnose',
            liveFilter: 'Live-Filter',
            navigation: 'Navigation',
            streaming: 'Streaming',
            playback: 'Wiedergabe',
            appearance: 'Darstellung',
        },
        user: {
            languageLabel: 'Sprache',
            languageHelp: 'Ändert die Oberflächensprache der App sofort. Wirkt sich nicht auf Sendernamen oder Anbieterdaten aus.',
        },
        diagnostics: {
            exportButton: 'Konfiguration exportieren (XML)',
            exportHelp:
                'Lädt jede Einstellung, jede Quelle und jeden Sender herunter, den Ihr Anbieter liefert, zusammen mit dem, was der Filter aus dem Namen gemacht hat — der schnellste Weg zu erkennen, warum ein Sender fehlt. Anmeldedaten in URLs werden geschwärzt, prüfen Sie die Datei aber vor dem Teilen.',
            exportDone: 'Export heruntergeladen.',
            exportFailed: 'Export fehlgeschlagen.',
            exportRawButton: 'Rohe Serverantworten exportieren (XML)',
            exportRawHelp:
                'Die Antworten des Anbieters genau so, wie sie empfangen wurden, vor jeder Verarbeitung — das unverarbeitete Gegenstück zum Konfigurationsexport. Nur im Arbeitsspeicher erfasst, ein Neuladen löscht sie also: importieren Sie die Quelle oder klicken Sie oben auf Aktualisieren, dann exportieren. Xtream wiederholt Ihren Benutzernamen und Ihr Passwort in user_info, daher werden nur diese beiden Felder geschwärzt.',
            exportEpgButton: 'EPG exportieren (XML)',
            exportEpgHelp:
                'Jeder gespeicherte Guide-Sender und jede Sendung. Ein leerer Guide neben einer vollständigen Senderliste bedeutet meist, dass die tvg-id des Senders nicht mit der EPG-Sender-ID übereinstimmt.',
            ...deEpg.diagnostics,
        },
        liveFilter: {
            countryLabel: 'Land',
            countryAll: 'Alle Länder',
            countryHelp:
                'Wird mit dem "| NL |"-artigen Präfix verglichen, das Ihr Anbieter Sendern und Kategorien voranstellt. Wählen Sie "Alle Länder", um jeden Sender zu behalten und Duplikate trotzdem zusammenzuführen.',
            knownOnly: 'Nur kuratierte Senderliste',
            knownOnlyHelp:
                'Standardmäßig aktiv: Live zeigt nur Sender aus der integrierten niederländischen Liste. Deaktivieren, um jeden Sender Ihres Anbieters zu sehen, wobei die bekannten Sender weiterhin zuerst gelistet werden — nützlich, wenn ein erwarteter Sender fehlt. Gilt nie für Radio.',
            dropJunk: 'Füllsender ausblenden',
            dropJunkHelp:
                'Entfernt nummerierte Event-Slots (VIAPLAY 07, PPV 12…), Trennzeilen und Erwachseneninhalte. Beurteilt nur anhand des Sendernamens — hier wird nicht geprüft, ob ein Stream tatsächlich funktioniert.',
            ...deEpg.liveFilter,
        },
        navigation: {
            help: 'Wählen Sie, welche Schaltflächen in der Seitenleiste erscheinen. Live wird immer angezeigt.',
            sources: 'Quellen',
            categories: 'Kategorien',
            radio: 'Radio',
            starred: 'Favoriten',
            recents: 'Zuletzt',
            guide: 'Guide',
            movies: 'Filme',
            series: 'Serien',
        },
        streaming: {
            proxyLabel: 'Proxy-URL-Vorlage',
            proxyPlaceholder: 'https://mein-proxy.beispiel/{url}',
            proxyHelp:
                'Optional. Wird bei Playlist-, EPG- und API-Anfragen angewendet, wenn festgelegt. Es wird kein öffentlicher Proxy bereitgestellt oder zugesichert — Videosegmente werden separat vom Player abgerufen und bleiben im Web ohnehin an CORS gebunden.',
            proxySave: 'Speichern',
            proxyInvalid: 'Muss eine gültige https://-URL sein (oder http://localhost zum lokalen Testen).',
            proxySaved: 'Gespeichert.',
            refreshNow: 'Senderliste aktualisieren',
            refreshHelp:
                'Anbieter nummerieren ihre Streams regelmäßig neu — die Liste aktualisiert sich auch selbst, wenn sie älter als 6 Stunden ist, und nachdem ein Sender einen 404 liefert.',
            refreshBusy: 'Wird aktualisiert…',
            refreshDone: 'Senderliste aktualisiert.',
            refreshFailed: 'Konnte nicht aktualisiert werden — öffnen Sie zuerst die Quelle oder prüfen Sie deren Verbindungsdaten.',
            xtreamTitle: 'Xtream Codes-Konto',
            xtreamUrlLabel: 'Server-URL',
            xtreamUrlPlaceholder: 'http://anbieter.beispiel:8080',
            xtreamUserLabel: 'Benutzername',
            xtreamPassLabel: 'Passwort',
            xtreamPassPlaceholder: '•••• (unverändert)',
            xtreamSave: 'Konto speichern',
            xtreamMissingFields: 'Server-URL und Benutzername sind erforderlich.',
            xtreamPasswordRequired: 'Für ein neues Konto ist ein Passwort erforderlich.',
            xtreamSaved: 'Konto gespeichert.',
            xtreamHelp: 'Geben Sie Ihre Anbieterdaten ein oder aktualisieren Sie sie hier — dies ist dasselbe Konto, das der Verbinden-Import verwendet.',
            wizardReopenButton: 'Einrichtungsassistent erneut ausführen',
            wizardReopenHint: 'Wiederholt die anfängliche Einrichtung von Sprache, Inhaltsland und Xtream-Konto.',
        },
        playback: {
            engine: 'Wiedergabe-Engine',
            engineMpegts: 'MPEG-TS',
            engineHls: 'HLS',
            engineNative: 'Browser',
            engineHelp:
                'Welche Engine zuerst versucht wird — jede fällt auf die anderen zurück, eine falsche Wahl kostet also nur einen weiteren Versuch, nie die Wiedergabe selbst. Die meisten Xtream-Anbieter senden einen rohen MPEG-TS-Stream (Standard). Wählen Sie HLS, wenn Ihr Anbieter echte segmentierte Playlists sendet; Browser übergibt den Stream direkt an den Player des Betriebssystems (die einzige Option auf iPhone/iPad).',
            buffering: 'Pufferung',
            bufferingAuto: 'Automatisch',
            bufferingSmooth: 'Sanft',
            bufferingLowLatency: 'Niedrige Latenz',
            bufferingHelp:
                'Automatisch bemisst den Puffer anhand Ihrer Verbindung und vergrößert ihn, sobald die Wiedergabe tatsächlich stockt. Sanft hält immer einige Sekunden gepuffert. Niedrige Latenz bleibt am nächsten am Live-Rand, stockt aber bei jeder Störung erneut — nur für stabile Netzwerke.',
            audioLanguageLabel: 'Bevorzugte Audiosprache',
            audioLanguageHelp: 'Wird verwendet, wenn ein Film oder eine Folge mehr als eine Tonspur anbietet. Nicht jeder Anbieter kennzeichnet seine Spuren, daher ist dies eine Vorliebe, keine Garantie.',
            audioLanguageAuto: 'Original / Automatisch',
            subtitleLanguageLabel: 'Bevorzugte Untertitelsprache',
            subtitleLanguageHelp: 'Wird verwendet, wenn ein Film oder eine Folge Untertitelspuren enthält. "Automatisch" leitet eine Sprache von Ihrem Live-Filterland ab.',
            subtitleAuto: 'Automatisch (mein Land)',
            subtitleOff: 'Aus',
        },
        appearance: {
            density: 'Dichte',
            densityCompact: 'Kompakt',
            densityComfortable: 'Komfortabel',
        },
    },

    wizard: {
        title: 'Willkommen bei ThunderTV',
        skip: 'Vorerst überspringen',
        step1: {
            heading: 'Richten wir Sie ein',
            intro: 'Wählen Sie Ihre Sprache und Ihr bevorzugtes Inhaltsland — beides können Sie jederzeit in den Einstellungen ändern.',
            next: 'Weiter',
        },
        step2: {
            heading: 'Fügen Sie Ihre Sender hinzu',
            intro: 'Geben Sie Ihr Xtream-Codes-Konto ein, um jetzt Ihre Sender zu importieren, oder überspringen Sie diesen Schritt und fügen Sie später über die Verbinden-Karte eine Quelle hinzu.',
            back: 'Zurück',
        },
    },

    list: {
        ...deEpg.list,
        chooseSource: 'Playlist auswählen',
        backToSources: '← Quellen',
        allChannels: 'Alle Sender',
        groupsHeading: 'Gruppen',
        groupsTruncatedTemplate: 'Die ersten {count} Gruppen werden angezeigt.',
        radioLabel: 'Radiosender',
        noChannels: 'Für diese Quelle sind noch keine Sender geladen.',
        noActiveSource: {
            heading: 'Keine Quelle ausgewählt',
            noSources: 'Auf diesem Gerät wurde noch nichts importiert. Fügen Sie eine Playlist oder ein Xtream-Konto hinzu, um zu beginnen.',
            pickOne:
                'Es ist eine Quelle gespeichert, aber keine ist aktiv — das passiert auch, wenn die zuletzt ausgewählte Quelle nicht mehr gespeichert ist. Wählen Sie eine aus, dann füllt sich diese Ansicht.',
            openSources: 'Zu Quellen',
        },
        backToGroups: '← Gruppen',
        playerStop: 'Stopp',
        playerFullscreen: 'Vollbild',
        playerNextVisual: 'Nächster Visual',
        playerPauseVisual: 'Visual pausieren',
        playerResumeVisual: 'Visual fortsetzen',
        visualizerPickerLabel: 'Visualizer',
        visualizerAuto: 'Automatisch (Wechsel)',
        visualizerGenreGroup: 'Nach Genre',
        visualizerAbstractGroup: 'Abstrakt',
        visualizerEdm: 'EDM',
        visualizerJazz: 'Jazz',
        visualizerBlues: 'Blues',
        visualizerRock: 'Rock',
        visualizerMetal: 'Metal',
        visualizerClassical: 'Klassik',
        visualizerSpectrum: 'Radiales Spektrum',
        visualizerParticles: 'Partikelsturm',
        visualizerKaleidoscope: 'Kaleidoskop',
        visualizerFractalTunnel: 'Fraktaltunnel',
        playerErrorPrefix: 'Wiedergabe fehlgeschlagen:',
        signalGood: 'Stream stabil',
        signalFair: 'Stream puffert gelegentlich',
        signalPoor: 'Stream stockt — Verbindung zu langsam oder instabil',
        nowPlayingEmpty: 'Wählen Sie einen Sender, um mit dem Ansehen zu beginnen.',
        ...dePlayerTracks,
    },

    import: {
        stage: {
            fetching: 'Wird abgerufen…',
            reading: 'Wird gelesen…',
            parsing: 'Wird verarbeitet…',
            writing: 'Wird gespeichert…',
        },
        rowsReadout: '{count} Sender…',
        cancel: 'Abbrechen',
        errors: {
            invalidM3u: 'Dies sieht nicht wie eine M3U-Playlist aus.',
            duplicateTemplate: 'Dies scheint identisch mit "{name}" zu sein — trotzdem importieren?',
            importAnyway: 'Trotzdem importieren',
            largeConfirm: 'Dies ist ein großer eingefügter Text und die Verarbeitung kann einen Moment dauern.',
            continueAnyway: 'Trotzdem fortfahren',
        },
        retry: 'Erneut versuchen',
        retryViaProxy: 'Über Proxy erneut versuchen',
        dismiss: 'Schließen',
        summary: {
            heading: 'Import abgeschlossen',
            updatedHeading: 'Playlist aktualisiert',
            channelsTemplate: '{count} Sender',
            channelTemplate: '{count} Sender',
            groupsTemplate: '{count} Gruppen',
            groupTemplate: '{count} Gruppe',
            radioTemplate: '{count} Radiosender',
            radioSingularTemplate: '{count} Radiosender',
            skippedTemplate: '{count} unlesbare Einträge übersprungen',
            skippedSingularTemplate: '{count} unlesbarer Eintrag übersprungen',
            drmTemplate: '{count} DRM-geschützte Sender erkannt (noch nicht abspielbar)',
            drmSingularTemplate: '{count} DRM-geschützter Sender erkannt (noch nicht abspielbar)',
            epgTemplate: '{count} EPG-Quellen erkannt',
            epgSingularTemplate: '{count} EPG-Quelle erkannt',
            openList: 'Senderliste öffnen',
            dismiss: 'Schließen',
        },
        sources: {
            needsReupload: 'Erneuter Upload erforderlich — Dateiinhalt wurde auf diesem Gerät nicht gespeichert.',
            lastRefreshTemplate: 'Zuletzt aktualisiert am {date}',
        },
    },
} as const;
