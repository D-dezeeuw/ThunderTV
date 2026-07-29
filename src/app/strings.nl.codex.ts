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
    },
} as const;
