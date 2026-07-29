/** Codex (stone 4) copy — its own overflow file; see `strings.en.epg.ts` for why these live outside `strings.en.ts`. */
export const enCodex = {
    codex: {
        sectionTitle: 'Codex',
        about:
            'A Codex is a file holding what this device has worked out: which provider channels map to which programme guide, and which feeds actually play. It contains no username, no password and no stream address — only a fingerprint of each. Share it with another device, or another person, to give them what you have learned.',
        yourId: 'This device signs as:',
        exportButton: 'Export Codex',
        importButton: 'Import a Codex…',
        exported: 'Exported. Channel mappings · feeds:',
        imported: 'Imported. Channel mappings · feeds:',
        exportFailed: 'Could not build a Codex.',
        readFailed: 'Could not read that file.',
        notJson: 'That file is not JSON.',
        notACodex: 'That JSON is not a Codex file.',
        badSignature:
            'That Codex failed its signature check, so it has been rejected — it was altered after it was written, or it was not signed by the key it carries.',
        unavailable: 'This browser cannot sign files, so Codex export is unavailable here.',
        /** Deliberately narrow: a valid signature proves the file is unaltered, not that its author is trustworthy. */
        signatureNote:
            'A valid signature proves a Codex has not been altered since it was written, and that two files came from the same author. It does not say whether that author is right.',
    },
} as const;
