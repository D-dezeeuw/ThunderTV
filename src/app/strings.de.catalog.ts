/** German counterpart of `strings.en.catalog.ts` — see its header for why this is a separate file. */
export const deCatalog = {
    catalog: {
        loading: 'Wird geladen…',
        itemsLabel: 'Titel',
        noSource: 'Verbinden Sie ein Xtream-Codes-Konto, um diesen Katalog zu durchsuchen.',
        noSourceAction: 'Einstellungen öffnen',
        fetchFailed: 'Dieser Katalog konnte nicht geladen werden. Versuchen Sie es gleich noch einmal.',
        noCategories: 'Dieser Anbieter hat keine Kategorien zum Anzeigen.',
        emptyCategory: 'Noch nichts in dieser Kategorie.',
        close: 'Schließen',
        play: 'Abspielen',
        retry: 'Erneut versuchen',
        offline: 'Gespeicherte Daten — der Anbieter war nicht erreichbar. Heruntergeladene Titel laufen weiterhin.',
    },

    movies: {
        categoriesAria: 'Filmkategorien',
        detailAria: 'Filmdetails',
    },

    series: {
        categoriesAria: 'Serienkategorien',
        detailAria: 'Seriendetails',
        seasonPrefix: 'Staffel',
        episodePrefix: 'F',
        minutesSuffix: 'Min.',
        noEpisodes: 'Für diese Serie sind noch keine Folgen gelistet.',
    },

    downloads: {
        action: 'Herunterladen',
        queueTitle: 'Downloads',
        queueAria: 'Download-Warteschlange',
        progressAria: 'Download-Fortschritt',
        cancel: 'Abbrechen',
        remove: 'Entfernen',
        clearFinished: 'Abgeschlossene entfernen',
        queued: 'Wartet…',
        starting: 'Startet…',
        done: 'Gespeichert',
        cancelled: 'Abgebrochen',
        handoff: 'An die Downloads deines Browsers übergeben.',
        errorNetwork:
            'Die Übertragung wurde gestoppt. Anbieter begrenzen meist, wie viele Verbindungen ein Konto gleichzeitig öffnen darf — erst die Wiedergabe zu stoppen hilft oft.',
        errorDisk: 'Die Datei konnte nicht geschrieben werden. Prüfe, ob das Ziel noch existiert und genug Platz hat.',
    },

    search: {
        placeholder: 'Titel suchen…',
        clear: 'Suche löschen',
        scopeAll: 'Alle',
        scopeChannels: 'Sender',
        scopeMovies: 'Filme',
        scopeSeries: 'Serien',
        loadedOnlyHint: 'Durchsucht nur bereits geladene Titel — öffnen Sie weitere Kategorien für vollständigere Ergebnisse.',
    },
} as const;
