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
            corsHint:
                "Browser security (CORS) blocks most providers from a direct URL import — file upload always works, and URL import will suggest a proxy if it's blocked.",
            // TODO(phase-07): temporary proof of Feature 03.7.10 (WebFileAdapter
            // wired to a real button) — removed once the real import flow lands.
            pickedFileTemplate: 'Picked: {name} ({size} bytes)',
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

    http: {
        failure: {
            http: 'The server responded with an error.',
            timeout: 'The request took too long and timed out.',
            corsOrNetwork:
                "This provider's server blocked the request, or a network error occurred. Providers rarely allow direct browser access (CORS) — try downloading the playlist file and uploading it instead, or configure a proxy in Settings → Streaming.",
            offline: 'This device appears to be offline. Check the network connection and try again.',
            mixedContent:
                'This playlist uses an unencrypted (http://) address, which browsers block on a secure (https://) page. Configure a proxy in Settings → Streaming, or use the desktop app, which has no such restriction.',
            tooLarge: 'The response was larger than expected and was stopped to protect memory.',
        },
        proxy: {
            invalidTemplate: 'Proxy address must start with https:// (or http://localhost for local testing).',
            credentialWarning:
                'Requests routed through a proxy — including Xtream Codes credentials embedded in the URL — are visible to whoever operates that proxy. Only use a proxy you trust.',
        },
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
