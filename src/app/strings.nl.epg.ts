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
    playback: {
        hideNoAudioTitles: 'Verberg titels zonder geluid op dit apparaat',
        hideNoAudioTitlesHelp:
            'Verbergt alleen titels die dit apparaat al zonder geluid heeft afgespeeld (en op de desktop ook niet kon omzetten). Standaard uit \u2014 de waarschuwing op de detailpagina blijft altijd staan.',
        showHandoffButton: 'Toon knop "Doorgaan op ander apparaat"',
        showHandoffButtonHelp: 'Voegt een knop toe aan de spelerbalk om de huidige stream over te dragen naar een ander scherm. Standaard uit.',
    },
    list: {
        streamLikelyDead: 'Deze feed is de laatste tijd meestal mislukt. Hij kan nog steeds werken — dit is een inschatting op basis van uw eigen kijkgeschiedenis.',
    },
    /** Complete top-level blocks, spread as one line into `strings.<locale>.ts` — that file has no room left for a nested block of its own. */
    topLevel: {
        guide: {
            nowLabel: 'Nu',
            noDescription: 'Geen beschrijving beschikbaar voor dit programma.',
            watchChannel: 'Deze zender kijken',
            earlier: 'Eerder',
            later: 'Later',
            backToNow: 'Terug naar nu',
            playChannel: 'Deze zender afspelen',
        },
        health: {
            sectionTitle: 'Streamkwaliteit',
            readout: 'Feeds met afspeelgeschiedenis:',
            deadReadout: '· waarschijnlijk dood:',
            clearButton: 'Streamkwaliteit vergeten',
            clearHelp:
                'Verwijdert alles wat ThunderTV heeft geleerd over welke feeds afspelen en welke mislukken. Alleen uw eigen afspeelgedrag wordt vastgelegd, en van elke URL alleen een vingerafdruk zonder inloggegevens — nooit uw gebruikersnaam of wachtwoord.',
            cleared: 'Streamkwaliteit vergeten.',
        },
    },
} as const;
