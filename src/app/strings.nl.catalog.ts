/** Dutch counterpart of `strings.en.catalog.ts` — see its header for why this is a separate file. */
export const nlCatalog = {
    catalog: {
        loading: 'Bezig met laden…',
        itemsLabel: 'Titels',
        noSource: 'Koppel een Xtream Codes-account om deze catalogus te bekijken.',
        noSourceAction: 'Instellingen openen',
        fetchFailed: 'Deze catalogus kon niet worden geladen. Probeer het zo weer.',
        noCategories: 'Deze provider heeft geen categorieën om te tonen.',
        emptyCategory: 'Nog niets in deze categorie.',
        close: 'Sluiten',
        play: 'Afspelen',
        retry: 'Opnieuw proberen',
        offline: 'Opgeslagen gegevens — de provider was niet bereikbaar. Gedownloade titels spelen gewoon af.',
        variantsToggle: 'Andere versies van deze categorie',
    },

    movies: {
        categoriesAria: 'Filmcategorieën',
        detailAria: 'Filmdetails',
    },

    series: {
        categoriesAria: 'Seriecategorieën',
        detailAria: 'Seriedetails',
        seasonPrefix: 'Seizoen',
        episodePrefix: 'A',
        minutesSuffix: 'min',
        noEpisodes: 'Nog geen afleveringen voor deze serie.',
        nextUpLabel: 'Hierna',
        nextPlay: 'Volgende afspelen',
        nextDismiss: 'Sluiten',
        nextAria: 'Volgende aflevering',
    },

    downloads: {
        action: 'Downloaden',
        queueTitle: 'Downloads',
        queueAria: 'Downloadwachtrij',
        progressAria: 'Downloadvoortgang',
        cancel: 'Annuleren',
        remove: 'Verwijderen',
        clearFinished: 'Voltooide wissen',
        queued: 'In wachtrij…',
        starting: 'Starten…',
        done: 'Opgeslagen',
        cancelled: 'Geannuleerd',
        handoff: 'Doorgegeven aan de downloads van je browser.',
        errorNetwork:
            'De overdracht is gestopt. Providers beperken meestal hoeveel verbindingen één account tegelijk mag openen, dus eerst het afspelen stoppen helpt vaak.',
        errorDisk: 'Het bestand kon niet worden weggeschreven. Controleer of de bestemming nog bestaat en genoeg ruimte heeft.',
    },

    search: {
        placeholder: 'Zoek titels…',
        clear: 'Zoekopdracht wissen',
        scopeAll: 'Alles',
        scopeChannels: 'Zenders',
        scopeMovies: 'Films',
        scopeSeries: 'Series',
        loadedOnlyHint: 'Doorzoekt alleen geladen titels — open meer categorieën voor volledigere resultaten.',
        allOff: 'Alle providers doorzoeken',
        allOn: 'Doorzoekt alle providers — terug naar deze',
        partialHint: 'Sommige providers waren niet bereikbaar, dus deze resultaten zijn onvolledig.',
        sweepTitle: 'Alle providers doorzoeken',
        sweepWarning:
            'Hiermee wordt de volledige film- en seriecatalogus van elke ingestelde provider opgehaald. Dat kan enkele minuten duren en verplaatst veel data. Het resultaat wordt een dag bewaard, dus de volgende zoekopdracht is direct.',
        sweepStart: 'Starten',
        sweepProviders: 'Providers',
        sweepCategories: 'Categorieën',
        sweepItems: 'Titels gevonden',
        sweepFailed: 'Niet bereikbaar',
        sweepPartial: 'Klaar, maar onvolledig — sommige providers zijn overgeslagen of mislukt.',
        sweepComplete: 'Klaar — alle providers zijn meegenomen.',
        sweepCancelled: 'Gestopt. Alles wat al is opgehaald, is bewaard.',
    },
    /** De lijst/raster-schakelaar naast het zoekveld van elke weergave. */
    layout: {
        group: 'Weergave',
        list: 'Lijstweergave',
        grid: 'Rasterweergave',
    },
} as const;
