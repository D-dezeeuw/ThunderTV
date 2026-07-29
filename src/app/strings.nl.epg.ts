/** Phase 31 EPG country-catalog copy — see `strings.en.epg.ts` for why this is a separate file. */
export const nlEpg = {
    live: {
        epgFellBack:
            'De EPG-catalogus heeft hier nog niets mee overeen laten komen, alle zenders worden getoond. Ververs de programmagegevens in Instellingen, of controleer het gekozen land.',
    },
    diagnostics: {
        epgCatalogReadout: 'EPG-catalogus: bekende zenders',
        epgMatchedReadout: '· overeenkomend met uw lijst:',
        refreshEpgButton: 'Programmagegevens nu verversen',
        refreshEpgHelp:
            'Haalt de EPG-landcatalogus en programmagegevens opnieuw op, zonder het normale verversingsschema af te wachten — gebruik dit na het wisselen van land, of als een verwachte zender nog steeds niet overeenkomt.',
        clearEpgCacheButton: 'EPG-cache wissen',
        clearEpgCacheHelp:
            'Verwijdert de opgeslagen EPG-catalogus, programmagegevens en koppelingen voor het gekozen land, en bouwt ze daarna helemaal opnieuw op. Gebruik dit als de gids vastzit op verouderde gegevens — deze gegevens overleven bewust een normale herlaad, dus dit is de handmatige reset.',
        epgCacheDone: 'Klaar.',
        epgCacheFailed: 'Er ging iets mis — probeer het straks opnieuw.',
    },
    liveFilter: {
        epgVerifiedOnly: 'Alleen EPG-geverifieerde zenders',
        epgVerifiedOnlyHelp:
            'Standaard uit: een zender die de EPG-catalogus nog niet heeft gekoppeld, is vaker een ontbrekend stukje programmagegevens dan een niet-bestaande zender. Zet dit aan zodra uw catalogus gevuld is om zenders zonder programmagegevens te verbergen. Geldt nooit voor Radio.',
    },
} as const;
