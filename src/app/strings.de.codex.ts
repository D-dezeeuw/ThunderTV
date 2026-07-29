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
    },
} as const;
