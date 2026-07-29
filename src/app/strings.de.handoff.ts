/** Handoff (stone 9) copy — eigene Overflow-Datei; siehe `strings.de.epg.ts` für den Grund. */
export const deHandoff = {
    handoff: {
        button: 'Auf einem anderen Gerät fortsetzen',
        offered: 'Öffnen Sie diese Adresse auf dem anderen Gerät:',
        copied: 'Link kopiert. Öffnen Sie ihn auf dem anderen Gerät:',
        dismiss: 'Fertig',
        arrived: 'Fortsetzung:',
        nothingPlaying: 'Es läuft nichts, das übergeben werden könnte.',
        cannotShare:
            'Dieser Stream kann nicht übergeben werden — seine Adresse lässt sich nicht beschreiben, ohne Ihre Zugangsdaten mitzuschicken, und die kommen nicht in einen Link.',
        wrongSource: 'Das lief von einer Quelle, die dieses Gerät nicht hat. Fügen Sie sie hinzu und öffnen Sie den Link erneut.',
        notFound: 'Dieser Sender ist in der Kopie der Quelle auf diesem Gerät nicht enthalten.',
        note:
            'Der Link enthält weder Benutzernamen noch Passwort noch Stream-Adresse — nur, um welchen Feed es ging und wie weit Sie waren. Er funktioniert auf einem Gerät, das dieselbe Quelle bereits hat.',
    },
} as const;
