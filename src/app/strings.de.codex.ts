/** Codex (stone 4) copy — eigene Overflow-Datei; siehe `strings.de.epg.ts` für den Grund. */
export const deCodex = {
    codex: {
        sectionTitle: 'Codex',
        about:
            'Ein Codex ist eine Datei mit dem, was dieses Gerät herausgefunden hat: welche Sender Ihres Anbieters zu welchem Programmführer gehören und welche Feeds tatsächlich abspielen. Sie enthält keinen Benutzernamen, kein Passwort und keine Stream-Adresse — nur einen Fingerabdruck davon. Teilen Sie sie mit einem anderen Gerät oder einer anderen Person, um weiterzugeben, was Sie gelernt haben.',
        yourId: 'Dieses Gerät signiert als:',
        exportButton: 'Codex exportieren',
        importButton: 'Einen Codex importieren…',
        exported: 'Exportiert. Senderzuordnungen · Feeds:',
        imported: 'Importiert. Senderzuordnungen · Feeds:',
        exportFailed: 'Konnte keinen Codex erstellen.',
        readFailed: 'Diese Datei konnte nicht gelesen werden.',
        notJson: 'Diese Datei ist kein JSON.',
        notACodex: 'Dieses JSON ist keine Codex-Datei.',
        badSignature:
            'Dieser Codex wurde abgelehnt, weil die Signaturprüfung fehlschlug — die Datei wurde nach dem Schreiben verändert, oder sie wurde nicht mit dem mitgeführten Schlüssel signiert.',
        unavailable: 'Dieser Browser kann keine Dateien signieren, daher ist der Codex-Export hier nicht verfügbar.',
        signatureNote:
            'Eine gültige Signatur beweist, dass ein Codex seit dem Schreiben nicht verändert wurde und dass zwei Dateien vom selben Autor stammen. Sie sagt nichts darüber aus, ob dieser Autor recht hat.',
        library: {
            title: 'Geteilte Codizes',
            about:
                'Folgen Sie einem Codex, den jemand veröffentlicht hat — ein Link zu einer Datei auf einem beliebigen Host. Er wird täglich erneut geprüft, und was er weiß, wird mit Ihrem Wissen zusammengeführt. Nichts wird hochgeladen, und es gibt kein Konto: Der Link ist der ganze Mechanismus.',
            urlLabel: 'Codex-Adresse',
            urlPlaceholder: 'https://beispiel.de/codex.json',
            addButton: 'Folgen',
            refreshButton: 'Nach Aktualisierungen suchen',
            removeButton: 'Nicht mehr folgen',
            blockButton: 'Nicht mehr vertrauen',
            unblockButton: 'Wieder vertrauen',
            empty: 'Sie folgen noch keinen geteilten Codizes.',
            signedBy: 'signiert von',
            claimCounts: 'Senderzuordnungen · Feeds',
            neverFetched: 'noch nicht abgerufen',
            unreachable: 'Diese Adresse konnte nicht abgerufen werden.',
            tooMany: 'Sie können höchstens 16 Codizes gleichzeitig folgen.',
            blockedAuthorProblem: 'Dieser Codex ist von einem Autor signiert, dem Sie nicht mehr vertrauen.',
            added: 'Sie folgen diesem jetzt.',
            refreshed: 'Aktuell. Geänderte Senderzuordnungen · Feeds:',
            blockNote:
                'Das Entziehen des Vertrauens entfernt die Beiträge dieses Autors und baut alles, was Sie wissen, aus Ihrer eigenen Erfahrung plus den weiterhin gefolgten Codizes neu auf. Da die Dateien aufbewahrt werden, ist das exakt und keine Schätzung.',
            trustNote:
                'Ein geteilter Codex kann Ihr Wissen ergänzen, aber nie überstimmen: Was Sie tatsächlich gesehen haben, zählt mehr als die Behauptung einer fremden Person.',
            blockedTitle: 'Nicht mehr vertraut',
        },
    },
} as const;
