/**
 * Dutch copy. Mirrors `strings.en.ts`'s exact key shape (`strings.spec.ts` asserts it).
 * Proper nouns and technical acronyms (M3U, EPG, Xtream Codes, CORS, HLS, DRM) stay untranslated.
 */
import { nlCatalog } from './strings.nl.catalog';
import { nlEpg } from './strings.nl.epg';
import { nlPlayerTracks } from './strings.nl.player';

export const nl = {
    appName: 'ThunderTV',

    rail: {
        live: 'Live',
        radio: 'Radio',
        movies: 'Films',
        series: 'Series',
        categories: 'Categorieën',
        sources: 'Bronnen',
        favorites: 'Favorieten',
        recent: 'Recent',
        guide: 'Gids',
        settings: 'Instellingen',
    },

    views: {
        live: { title: 'Live', heading: 'Live' },
        radio: { title: 'Radio', heading: 'Radio' },
        movies: { title: 'Films', heading: 'Films' },
        series: { title: 'Series', heading: 'Series' },
        categories: { title: 'Categorieën', heading: 'Categorieën' },
        sources: { title: 'Bronnen', heading: 'Bronnen' },
        favorites: { title: 'Favorieten', heading: 'Favorieten' },
        recent: { title: 'Recent', heading: 'Recent' },
        guide: { title: 'Gids', heading: 'Gids' },
        connect: { title: 'Verbinden', heading: 'Verbinden' },
    },

    ...nlCatalog,

    live: {
        channelsLabel: 'zenders totaal',
        statsTitle: 'Live-filter: varianten gegroepeerd en rijen verborgen die niet overeenkwamen',
        empty: {
            heading: 'Geen zenders komen overeen met het Live-filter',
            message:
                'Uw provider benoemt zenders mogelijk anders. Probeer een ander land, schakel "Alleen bekende zenders" uit, of blader door de ongewijzigde catalogus onder Categorieën.',
            openCategories: 'Alle categorieën bekijken',
            openSources: 'Bron toevoegen',
        },
        variants: {
            label: 'Andere feeds',
            catchUp: 'terugkijken',
            alt: 'alt',
        },
        strictFellBack: 'De samengestelde lijst kwam hier nergens mee overeen, alle zenders worden getoond. Geziene namen:',
        ...nlEpg.live,
    },

    debug: {
        title: 'Debug',
        open: 'Debugpaneel openen',
        openHelp:
            'Toont opgevangen fouten en de bijbehorende lijststatus. Opent ook met Ctrl/Cmd+Shift+D — handig als een weergave leeg is en de rest van de UI onbereikbaar is.',
        close: 'Debugpaneel sluiten',
        refresh: 'Vernieuwen',
        copy: 'Rapport kopiëren',
        clear: 'Log wissen',
        logTitle: 'Vastgelegd log',
        logEmpty: 'Nog niets vastgelegd.',
        errorsLabel: 'fout(en)',
        facts: {
            view: 'Actieve weergave',
            sources: 'Opgeslagen bronnen',
            activeId: 'ID actieve bron',
            activeResolved: 'Wordt herleid naar',
            rowsInMemory: 'Zenderrijen in geheugen',
            liveChannels: 'Live-zenders na filter',
            radioCount: 'Radiozenders',
            storage: 'Opslaglaag',
            platform: 'Platform',
        },
    },

    categories: {
        note: 'Elke categorie en zender exact zoals uw provider ze levert — ongefilterd en ongegroepeerd.',
    },

    radio: {
        note: 'Alleen-audio zenders uit deze bron. Radio heeft geen EPG en geen samengestelde lijst, dus alleen land- en ruisfiltering gelden.',
        empty: 'Geen radiozenders gevonden in deze bron',
        emptyHint:
            'Uw provider levert geen alleen-audio zenders, of benoemt ze op een manier die deze lijst niet herkende — de ongewijzigde catalogus onder Categorieën toont alles wat is verzonden.',
    },

    emptyStates: {
        firstRun: {
            heading: 'Voeg een bron toe om te beginnen',
            note: 'Of open een verbindingslink om dit apparaat in één keer te configureren.',
            file: 'M3U-bestand uploaden',
            urlPlaceholder: 'https://provider.voorbeeld/playlist.m3u',
            urlSubmit: 'Importeren via URL',
            pastePlaceholder: 'Plak hier uw M3U-playlist…',
            pasteSubmit: 'Geplakte tekst importeren',
            xtream: 'Xtream Codes toevoegen',
            xtreamComingSoon: 'Xtream Codes — binnenkort beschikbaar',
            xtreamUrlPlaceholder: 'http://provider.voorbeeld:8080',
            xtreamUserPlaceholder: 'Gebruikersnaam',
            xtreamPassPlaceholder: 'Wachtwoord',
            xtreamSubmit: 'Verbinden',
            corsHint:
                'Browserbeveiliging (CORS) blokkeert bij de meeste providers een directe URL-import — bestand uploaden werkt altijd, en URL-import stelt een proxy voor als het geblokkeerd wordt.',
        },
        demoRowsLabel: 'Dichtheidsvoorbeeld (voorbeeldrijen — nog geen echte zenders)',
        favorites: {
            heading: 'Nog geen favorieten',
            message: 'Zenders die u favoriet maakt, verschijnen hier.',
        },
        recent: {
            heading: 'Nog niets bekeken',
            message: 'Zenders die u afspeelt, verschijnen hier.',
        },
        guide: {
            heading: 'Nog geen EPG-gegevens',
            message: 'De programmagids wordt nog opgehaald, of er is nog niets gekoppeld aan uw zenders — kijk zo weer even.',
        },
        error: {
            heading: 'Er is iets misgegaan',
            retry: 'Opnieuw proberen',
        },
    },

    connect: {
        detected: 'Verbindingslink gedetecteerd — dit apparaat wordt zo geconfigureerd.',
    },

    guide: {
        nowLabel: 'Nu',
        detailEmpty: 'Selecteer een programma om de details hier te bekijken.',
        ...nlEpg.guide,
    },

    recent: {
        nowPlaying: 'Nu aan het afspelen:',
        playTitle: 'Afspelen',
        radioBadge: 'Radio',
    },

    storageNotice: {
        partial: 'Opslag is beperkt op dit apparaat — playlists worden bij het starten opnieuw geladen.',
        none: 'Niets blijft bewaard op dit apparaat — imports duren alleen deze sessie.',
        dismiss: 'Sluiten',
        learnMore: 'Meer informatie',
        userSectionTier: 'Opslag',
    },

    http: {
        failure: {
            httpAuth: 'Deze URL vereist inloggegevens, of de toegang werd geblokkeerd (401/403).',
            httpNotFound: 'Er is niets gevonden op deze URL — controleer deze (404).',
            httpServer: 'De provider heeft momenteel problemen — probeer het later opnieuw (5xx).',
            httpOther: 'De provider antwoordde met een foutmelding.',
            timeout: 'De provider reageerde te traag en het verzoek is verlopen.',
            corsOrNetwork:
                'De server van deze provider blokkeerde het verzoek, of er trad een netwerkfout op. Providers staan zelden directe browsertoegang toe (CORS) — probeer het playlistbestand te downloaden en te uploaden, of configureer een proxy bij Instellingen → Streaming.',
            offline: 'Dit apparaat lijkt offline te zijn. Controleer de netwerkverbinding en probeer het opnieuw.',
            mixedContent:
                'Deze playlist gebruikt een onbeveiligd (http://) adres, wat browsers blokkeren op een beveiligde (https://) pagina. Configureer een proxy bij Instellingen → Streaming, of gebruik de desktop-app, die deze beperking niet heeft.',
            tooLarge: 'Dit is groter dan verwacht en is gestopt om het geheugen te beschermen.',
            xtreamCorsOrNetwork:
                'De provider blokkeerde dit verzoek, of er trad een netwerkfout op. De meeste Xtream-providers staan geen directe browsertoegang toe (CORS) — configureer een proxy bij Instellingen → Streaming en controleer het serveradres nogmaals.',
            xtreamMixedContent:
                'Deze provider gebruikt een onbeveiligd (http://) adres, wat browsers blokkeren op een beveiligde (https://) pagina. Configureer een proxy bij Instellingen → Streaming, of gebruik de desktop-app, die deze beperking niet heeft.',
        },
        proxy: {
            invalidTemplate: 'Proxyadres moet beginnen met https:// (of http://localhost voor lokaal testen).',
            credentialWarning:
                'Verzoeken die via een proxy lopen — inclusief Xtream Codes-inloggegevens in de URL — zijn zichtbaar voor wie die proxy beheert. Gebruik alleen een proxy die u vertrouwt.',
        },
    },

    sourcesAdmin: {
        hiddenNote: 'Verborgen in de zijbalk omdat er geen afspeelbare zenders in zitten. Hier nog wel selecteerbaar.',
        showHidden: 'Verborgen bronnen tonen',
        allTitle: 'Standaardbron',
        allHint: 'Kies welke geïmporteerde bron Live, Radio en Categorieën tonen. Hier wisselen doet hetzelfde als er een kiezen bij Bronnen.',
        activeBadge: 'Actief',
    },

    settings: {
        title: 'Instellingen',
        close: 'Instellingen sluiten',
        sections: {
            user: 'Gebruiker',
            diagnostics: 'Diagnostiek',
            liveFilter: 'Live-filter',
            navigation: 'Navigatie',
            streaming: 'Streaming',
            playback: 'Afspelen',
            appearance: 'Weergave',
        },
        user: {
            languageLabel: 'Taal',
            languageHelp: 'Wijzigt direct de interfacetaal van de app. Heeft geen invloed op zendernamen of providergegevens.',
        },
        diagnostics: {
            exportButton: 'Configuratie exporteren (XML)',
            exportHelp:
                'Downloadt elke instelling, elke bron en elke zender die uw provider levert, samen met wat het filter van de naam heeft gemaakt — de snelste manier om te zien waarom een zender ontbreekt. Inloggegevens in URL\'s worden onleesbaar gemaakt, maar controleer het bestand voordat u het deelt.',
            exportDone: 'Export gedownload.',
            exportFailed: 'Export mislukt.',
            exportRawButton: 'Ruwe serverreacties exporteren (XML)',
            exportRawHelp:
                'De antwoorden van de provider precies zoals ontvangen, vóór enige verwerking — de onbewerkte tegenhanger van de configuratie-export. Alleen in het geheugen vastgelegd, dus een herlaad wist ze: importeer de bron of klik hierboven op Vernieuwen, en exporteer dan. Xtream herhaalt uw gebruikersnaam en wachtwoord in user_info, dus alleen die twee velden worden onleesbaar gemaakt.',
            exportEpgButton: 'EPG exporteren (XML)',
            exportEpgHelp:
                'Elke opgeslagen gidszender en elk programma. Een lege gids naast een volledige zenderlijst betekent meestal dat de tvg-id van de zender niet overeenkomt met de EPG-zender-id.',
            ...nlEpg.diagnostics,
        },
        liveFilter: {
            countryLabel: 'Land',
            countryAll: 'Alle landen',
            countryHelp:
                'Vergeleken met het "| NL |"-achtige voorvoegsel dat uw provider aan zenders en categorieën geeft. Kies "Alle landen" om elke zender te behouden en dubbele nog steeds samen te voegen.',
            knownOnly: 'Alleen samengestelde zenderlijst',
            knownOnlyHelp:
                'Standaard aan: Live toont alleen de zenders uit de ingebouwde Nederlandse lijst. Zet uit om elke zender van uw provider te zien, met de bekende zenders nog steeds bovenaan — handig als een verwachte zender ontbreekt. Geldt nooit voor Radio.',
            dropJunk: 'Vulzenders verbergen',
            dropJunkHelp:
                'Verwijdert genummerde eventslots (VIAPLAY 07, PPV 12…), scheidingsrijen en volwassen content. Alleen beoordeeld op de zendernaam — er wordt hier niet gecontroleerd of een stream daadwerkelijk werkt.',
            ...nlEpg.liveFilter,
        },
        navigation: {
            help: 'Kies welke knoppen in de zijbalk verschijnen. Live wordt altijd getoond.',
            sources: 'Bronnen',
            categories: 'Categorieën',
            radio: 'Radio',
            starred: 'Favorieten',
            recents: 'Recent',
            guide: 'Gids',
            movies: 'Films',
            series: 'Series',
        },
        streaming: {
            proxyLabel: 'Proxy-URL-sjabloon',
            proxyPlaceholder: 'https://mijn-proxy.voorbeeld/{url}',
            proxyHelp:
                'Optioneel. Wordt toegepast op playlist-, EPG- en API-verzoeken indien ingesteld. Er wordt geen publieke proxy aangeboden of beloofd — videosegmenten worden apart door de speler opgehaald en blijven op het web sowieso aan CORS gebonden.',
            proxySave: 'Opslaan',
            proxyInvalid: 'Moet een geldige https://-URL zijn (of http://localhost voor lokaal testen).',
            proxySaved: 'Opgeslagen.',
            refreshNow: 'Zenderlijst vernieuwen',
            refreshHelp:
                'Providers hernummeren hun streams regelmatig — de lijst vernieuwt zichzelf ook als deze ouder is dan 6 uur, en nadat een zender een 404 geeft.',
            refreshBusy: 'Bezig met vernieuwen…',
            refreshDone: 'Zenderlijst vernieuwd.',
            refreshFailed: 'Kon niet vernieuwen — open eerst de bron, of controleer de verbindingsgegevens.',
            xtreamTitle: 'Xtream Codes-account',
            xtreamUrlLabel: 'Server-URL',
            xtreamUrlPlaceholder: 'http://provider.voorbeeld:8080',
            xtreamUserLabel: 'Gebruikersnaam',
            xtreamPassLabel: 'Wachtwoord',
            xtreamPassPlaceholder: '•••• (ongewijzigd)',
            xtreamSave: 'Account opslaan',
            xtreamMissingFields: 'Server-URL en gebruikersnaam zijn verplicht.',
            xtreamPasswordRequired: 'Wachtwoord is verplicht voor een nieuw account.',
            xtreamSaved: 'Account opgeslagen.',
            xtreamHelp: 'Voer uw providergegevens in, of werk ze hier bij — dit is hetzelfde account dat de Verbinden-import gebruikt.',
            wizardReopenButton: 'Installatiewizard opnieuw uitvoeren',
            wizardReopenHint: 'Doorloop de eerste installatie van taal, inhoudsland en Xtream-account opnieuw.',
        },
        playback: {
            engine: 'Afspeel-engine',
            engineMpegts: 'MPEG-TS',
            engineHls: 'HLS',
            engineNative: 'Browser',
            engineHelp:
                'Welke engine als eerste wordt geprobeerd — elke valt terug op de andere, dus een verkeerde keuze kost hooguit een nieuwe poging, nooit afspelen zelf. De meeste Xtream-providers sturen een ruwe MPEG-TS-stream (de standaard). Kies HLS als uw provider echte gesegmenteerde playlists stuurt; Browser geeft de stream rechtstreeks aan de OS-speler (de enige optie op iPhone/iPad).',
            buffering: 'Buffering',
            bufferingAuto: 'Automatisch',
            bufferingSmooth: 'Soepel',
            bufferingLowLatency: 'Lage latentie',
            bufferingHelp:
                'Automatisch bepaalt de buffergrootte op basis van uw verbinding en vergroot deze zodra afspelen echt hapert. Soepel houdt altijd enkele seconden gebufferd. Lage latentie blijft het dichtst bij live maar hapert bij elke hapering opnieuw — alleen voor stabiele netwerken.',
            audioLanguageLabel: 'Voorkeurstaal audio',
            audioLanguageHelp: 'Gebruikt wanneer een film of aflevering meer dan één audiospoor aanbiedt. Niet elke provider labelt zijn sporen, dus dit is een voorkeur, geen garantie.',
            audioLanguageAuto: 'Origineel / Automatisch',
            subtitleLanguageLabel: 'Voorkeurstaal ondertitels',
            subtitleLanguageHelp: 'Gebruikt wanneer een film of aflevering ondertitelsporen bevat. "Automatisch" leidt een taal af van uw Live-filterland.',
            subtitleAuto: 'Automatisch (mijn land)',
            subtitleOff: 'Uit',
        },
        appearance: {
            density: 'Dichtheid',
            densityCompact: 'Compact',
            densityComfortable: 'Comfortabel',
        },
    },

    wizard: {
        title: 'Welkom bij ThunderTV',
        skip: 'Voorlopig overslaan',
        step1: {
            heading: 'Laten we u instellen',
            intro: 'Kies uw taal en gewenste inhoudsland — beide zijn later altijd wijzigbaar in Instellingen.',
            next: 'Doorgaan',
        },
        step2: {
            heading: 'Voeg uw zenders toe',
            intro: 'Voer uw Xtream Codes-account in om nu uw zenders te importeren, of sla over en voeg later een bron toe via de Verbinden-kaart.',
            back: 'Terug',
        },
    },

    list: {
        ...nlEpg.list,
        chooseSource: 'Kies een playlist',
        backToSources: '← Bronnen',
        allChannels: 'Alle zenders',
        groupsHeading: 'Groepen',
        groupsTruncatedTemplate: 'De eerste {count} groepen worden getoond.',
        radioLabel: 'Radiozender',
        noChannels: 'Nog geen zenders geladen voor deze bron.',
        noActiveSource: {
            heading: 'Geen bron geselecteerd',
            noSources: 'Er is nog niets geïmporteerd op dit apparaat. Voeg een playlist of een Xtream-account toe om te beginnen.',
            pickOne:
                'Er is een bron opgeslagen, maar geen daarvan is actief — dit gebeurt ook als de laatst gekozen bron niet meer in opslag staat. Kies er een en deze weergave wordt gevuld.',
            openSources: 'Naar Bronnen',
        },
        backToGroups: '← Groepen',
        playerStop: 'Stoppen',
        playerFullscreen: 'Volledig scherm',
        playerNextVisual: 'Volgende visual',
        playerPauseVisual: 'Visual pauzeren',
        playerResumeVisual: 'Visual hervatten',
        visualizerPickerLabel: 'Visualizer',
        visualizerAuto: 'Automatisch (wisselen)',
        visualizerGenreGroup: 'Op genre',
        visualizerAbstractGroup: 'Abstract',
        visualizerEdm: 'EDM',
        visualizerJazz: 'Jazz',
        visualizerBlues: 'Blues',
        visualizerRock: 'Rock',
        visualizerMetal: 'Metal',
        visualizerClassical: 'Klassiek',
        visualizerSpectrum: 'Radiaal spectrum',
        visualizerParticles: 'Deeltjesstorm',
        visualizerKaleidoscope: 'Caleidoscoop',
        visualizerFractalTunnel: 'Fractaltunnel',
        playerErrorPrefix: 'Afspelen mislukt:',
        signalGood: 'Stream stabiel',
        signalFair: 'Stream buffert af en toe',
        signalPoor: 'Stream sputtert — verbinding te traag of onstabiel',
        nowPlayingEmpty: 'Kies een zender om te beginnen met kijken.',
        ...nlPlayerTracks,
    },

    import: {
        stage: {
            fetching: 'Ophalen…',
            reading: 'Lezen…',
            parsing: 'Verwerken…',
            writing: 'Opslaan…',
        },
        rowsReadout: '{count} zenders…',
        cancel: 'Annuleren',
        errors: {
            invalidM3u: 'Dit lijkt geen M3U-playlist te zijn.',
            duplicateTemplate: 'Dit lijkt identiek aan "{name}" — toch importeren?',
            importAnyway: 'Toch importeren',
            largeConfirm: 'Dit is een grote plakbewerking en kan even duren om te verwerken.',
            continueAnyway: 'Toch doorgaan',
        },
        retry: 'Opnieuw proberen',
        retryViaProxy: 'Opnieuw proberen via proxy',
        dismiss: 'Sluiten',
        summary: {
            heading: 'Import voltooid',
            updatedHeading: 'Playlist bijgewerkt',
            channelsTemplate: '{count} zenders',
            channelTemplate: '{count} zender',
            groupsTemplate: '{count} groepen',
            groupTemplate: '{count} groep',
            radioTemplate: '{count} radiozenders',
            radioSingularTemplate: '{count} radiozender',
            skippedTemplate: '{count} onleesbare items overgeslagen',
            skippedSingularTemplate: '{count} onleesbaar item overgeslagen',
            drmTemplate: '{count} DRM-beveiligde zenders gevonden (nog niet af te spelen)',
            drmSingularTemplate: '{count} DRM-beveiligde zender gevonden (nog niet af te spelen)',
            epgTemplate: '{count} EPG-bronnen gevonden',
            epgSingularTemplate: '{count} EPG-bron gevonden',
            openList: 'Zenderlijst openen',
            dismiss: 'Sluiten',
        },
        sources: {
            needsReupload: 'Opnieuw uploaden vereist — bestandsinhoud is niet bewaard op dit apparaat.',
            lastRefreshTemplate: 'Laatst bijgewerkt op {date}',
        },
    },
} as const;
