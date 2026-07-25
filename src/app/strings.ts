/**
 * Central strings module. Every user-facing literal lives here — grep-
 * verified by no other module containing raw UI copy (Feature 02.6.7).
 * English only for now; centralizing keeps i18n possible without
 * committing to it (masterplan §7).
 */
export const strings = {
    appName: 'ThunderTV',

    rail: {
        sources: 'Sources',
        favorites: 'Favorites',
        recent: 'Recent',
        guide: 'Guide',
        settings: 'Settings',
    },

    views: {
        sources: { title: 'Sources', heading: 'Sources' },
        favorites: { title: 'Favorites', heading: 'Favorites' },
        recent: { title: 'Recent', heading: 'Recent' },
        guide: { title: 'Guide', heading: 'Guide' },
        connect: { title: 'Connect', heading: 'Connect' },
    },

    emptyStates: {
        firstRun: {
            heading: 'Add a source to get started',
            note: 'Or open a connect bookmark link to configure this device in one visit.',
            file: 'Upload M3U file',
            paste: 'Paste playlist text',
            url: 'Import from URL',
            xtream: 'Add Xtream Codes',
        },
        demoRowsLabel: 'Density preview (sample rows — no real channels yet)',
        favorites: {
            heading: 'No favorites yet',
            message: 'Channels you favorite will show up here.',
        },
        recent: {
            heading: 'Nothing watched yet',
            message: 'Channels you play will show up here.',
        },
        guide: {
            heading: 'No EPG data yet',
            message: 'Favorite some channels to see their program guide here.',
        },
        error: {
            heading: 'Something went wrong',
            retry: 'Retry',
        },
    },

    connect: {
        detected: 'Connect link detected — this device will be configured shortly.',
    },

    settings: {
        title: 'Settings',
        close: 'Close settings',
        sections: {
            user: 'User',
            streaming: 'Streaming',
            playback: 'Playback',
            appearance: 'Appearance',
        },
        appearance: {
            density: 'Density',
            densityCompact: 'Compact',
            densityComfortable: 'Comfortable',
        },
    },
} as const;
