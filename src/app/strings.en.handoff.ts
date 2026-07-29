/** Handoff (stone 9) copy — its own overflow file; see `strings.en.epg.ts` for why these live outside `strings.en.ts`. */
export const enHandoff = {
    handoff: {
        button: 'Continue on another device',
        offered: 'Open this address on the other device:',
        copied: 'Link copied. Open it on the other device:',
        dismiss: 'Done',
        arrived: 'Continuing:',
        nothingPlaying: 'Nothing is playing to hand over.',
        cannotShare:
            'This stream cannot be handed over — its address is not one the app can describe without including your login details, and it will not put those in a link.',
        wrongSource: 'That was playing from a source this device does not have. Add it, then open the link again.',
        notFound: 'That channel is not in this device\'s copy of the source.',
        /** The honest framing: a handoff is between devices that share a source, not a way to share access. */
        note:
            'The link carries no username, password or stream address — only which feed it was and how far in. It works on a device that already has the same source.',
    },
} as const;
