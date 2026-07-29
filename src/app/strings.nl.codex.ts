/** Codex (stone 4) copy — eigen overflow-bestand; zie `strings.nl.epg.ts` voor waarom. */
export const nlCodex = {
    codex: {
        sectionTitle: 'Codex',
        about:
            'Een Codex is een bestand met wat dit apparaat heeft uitgezocht: welke zenders van uw provider bij welke programmagids horen, en welke feeds daadwerkelijk afspelen. Het bevat geen gebruikersnaam, geen wachtwoord en geen streamadres — alleen een vingerafdruk daarvan. Deel het met een ander apparaat of een andere persoon om te delen wat u hebt geleerd.',
        yourId: 'Dit apparaat ondertekent als:',
        exportButton: 'Codex exporteren',
        importButton: 'Een Codex importeren…',
        exported: 'Geëxporteerd. Zenderkoppelingen · feeds:',
        imported: 'Geïmporteerd. Zenderkoppelingen · feeds:',
        exportFailed: 'Kon geen Codex maken.',
        readFailed: 'Kon dat bestand niet lezen.',
        notJson: 'Dat bestand is geen JSON.',
        notACodex: 'Die JSON is geen Codex-bestand.',
        badSignature:
            'Die Codex is afgekeurd omdat de handtekening niet klopt — het bestand is aangepast na het schrijven, of is niet ondertekend met de sleutel die het meedraagt.',
        unavailable: 'Deze browser kan geen bestanden ondertekenen, dus Codex-export is hier niet beschikbaar.',
        signatureNote:
            'Een geldige handtekening bewijst dat een Codex niet is gewijzigd sinds het schrijven, en dat twee bestanden van dezelfde auteur komen. Het zegt niets over of die auteur gelijk heeft.',
        library: {
            title: 'Gedeelde Codexen',
            about:
                'Volg een Codex die iemand heeft gepubliceerd — een link naar een bestand op eender welke host. Hij wordt dagelijks opnieuw gecontroleerd en wat hij weet wordt samengevoegd met wat u weet. Er wordt niets geüpload en er is geen account: de link is het hele mechanisme.',
            urlLabel: 'Codex-adres',
            urlPlaceholder: 'https://voorbeeld.nl/codex.json',
            addButton: 'Volgen',
            refreshButton: 'Controleren op updates',
            removeButton: 'Niet meer volgen',
            blockButton: 'Niet meer vertrouwen',
            unblockButton: 'Weer vertrouwen',
            empty: 'U volgt nog geen gedeelde Codexen.',
            signedBy: 'ondertekend door',
            claimCounts: 'zenderkoppelingen · feeds',
            neverFetched: 'nog niet opgehaald',
            unreachable: 'Kon dat adres niet ophalen.',
            tooMany: 'U kunt maximaal 16 Codexen tegelijk volgen.',
            blockedAuthorProblem: 'Die Codex is ondertekend door een auteur die u niet meer vertrouwt.',
            added: 'U volgt deze nu.',
            refreshed: 'Bijgewerkt. Gewijzigde zenderkoppelingen · feeds:',
            blockNote:
                'Vertrouwen intrekken verwijdert de bijdragen van die auteur en bouwt alles wat u weet opnieuw op uit uw eigen ervaring plus de Codexen die u nog volgt. Omdat de bestanden bewaard blijven, is dit exact en geen schatting.',
            trustNote:
                'Een gedeelde Codex kan bijsturen wat u weet, nooit overrulen: wat u zelf hebt gekeken telt zwaarder dan wat een vreemde erover beweert.',
            blockedTitle: 'Niet meer vertrouwd',
        },
    },
} as const;
