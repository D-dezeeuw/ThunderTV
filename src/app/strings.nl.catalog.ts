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
    },

    search: {
        placeholder: 'Zoek titels…',
        clear: 'Zoekopdracht wissen',
        scopeAll: 'Alles',
        scopeChannels: 'Zenders',
        scopeMovies: 'Films',
        scopeSeries: 'Series',
        loadedOnlyHint: 'Doorzoekt alleen geladen titels — open meer categorieën voor volledigere resultaten.',
    },
} as const;
