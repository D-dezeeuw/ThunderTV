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
        library: {
            title: 'Shared Codexes',
            about:
                'Follow a Codex someone has published — a link to a file on any host. It is re-checked once a day, and what it knows is merged with what you know. Nothing is uploaded, and there is no account: the link is the whole mechanism.',
            urlLabel: 'Codex address',
            urlPlaceholder: 'https://example.org/codex.json',
            addButton: 'Follow',
            refreshButton: 'Check for updates',
            removeButton: 'Unfollow',
            blockButton: 'Stop trusting',
            unblockButton: 'Trust again',
            empty: 'You are not following any shared Codexes.',
            signedBy: 'signed by',
            claimCounts: 'channel mappings · feeds',
            neverFetched: 'not fetched yet',
            unreachable: 'Could not fetch that address.',
            tooMany: 'You can follow up to 16 Codexes at once.',
            blockedAuthorProblem: 'That Codex is signed by an author you have stopped trusting.',
            added: 'Now following.',
            refreshed: 'Up to date. Channel mappings · feeds changed:',
            /** The honest version of what blocking does — exact for mappings, bounded for feed health. */
            blockNote:
                'Stopping trust removes that author\'s contributions and rebuilds everything you know from your own experience plus the Codexes you still follow. Because the files are kept, this is exact rather than a guess.',
            trustNote:
                'A shared Codex can nudge what you know, never overrule it: anything you have actually watched counts for more than what a stranger asserts about it.',
            blockedTitle: 'No longer trusted',
        },
    },
} as const;
