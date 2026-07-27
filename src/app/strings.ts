/**
 * Central strings module. Every user-facing literal lives here — grep-
 * verified by no other module containing raw UI copy (Feature 02.6.7).
 * English only for now; centralizing keeps i18n possible without
 * committing to it (masterplan §7).
 */
export const strings = {
    appName: 'ThunderTV',

    rail: {
        live: 'Live',
        categories: 'Categories',
        sources: 'Sources',
        favorites: 'Starred',
        recent: 'Recents',
        guide: 'Guide',
        settings: 'Settings',
    },

    views: {
        live: { title: 'Live', heading: 'Live' },
        categories: { title: 'Categories', heading: 'Categories' },
        sources: { title: 'Sources', heading: 'Sources' },
        favorites: { title: 'Starred', heading: 'Starred' },
        recent: { title: 'Recents', heading: 'Recents' },
        guide: { title: 'Guide', heading: 'Guide' },
        connect: { title: 'Connect', heading: 'Connect' },
    },

    live: {
        channelsLabel: 'channels',
        hiddenLabel: 'hidden',
        mergedLabel: 'merged',
        /** The filter is aggressive by design, so the header always states what it removed — a missing channel must never look like the provider's fault. */
        statsTitle: 'Live filter: grouped variants and hid rows that did not match',
        empty: {
            heading: 'No channels match the Live filter',
            message:
                'Your provider may label its channels differently. Try another country, switch off "Known channels only", or browse the untouched catalog under Categories.',
            openCategories: 'Browse all categories',
            openSources: 'Add a source',
        },
        variants: {
            label: 'Other feeds',
            catchUp: 'catch-up',
        },
    },

    categories: {
        note: 'Every category and channel exactly as your provider ships them — unfiltered and ungrouped.',
    },

    emptyStates: {
        firstRun: {
            heading: 'Add a source to get started',
            note: 'Or open a connect bookmark link to configure this device in one visit.',
            file: 'Upload M3U file',
            urlPlaceholder: 'https://provider.example/playlist.m3u',
            urlSubmit: 'Import from URL',
            pastePlaceholder: 'Paste your M3U playlist here…',
            pasteSubmit: 'Import pasted text',
            xtream: 'Add Xtream Codes',
            xtreamComingSoon: 'Xtream Codes — coming soon',
            xtreamUrlPlaceholder: 'http://provider.example:8080',
            xtreamUserPlaceholder: 'Username',
            xtreamPassPlaceholder: 'Password',
            xtreamSubmit: 'Connect',
            corsHint:
                "Browser security (CORS) blocks most providers from a direct URL import — file upload always works, and URL import will suggest a proxy if it's blocked.",
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

    recent: {
        // TODO(phase-13): temporary proof of Feature 05.4.6/05.5.6 (the
        // player.active/zapHistory cache rendering from state alone) —
        // removed once the real recent/favorites UI lands.
        nowPlaying: 'Now playing:',
    },

    storageNotice: {
        partial: 'Storage is limited on this device — playlists reload on start.',
        none: 'Nothing persists on this device — imports last for this session.',
        dismiss: 'Dismiss',
        learnMore: 'Learn more',
        userSectionTier: 'Storage',
    },

    http: {
        failure: {
            httpAuth: 'This URL requires credentials, or access was blocked (401/403).',
            httpNotFound: 'Nothing was found at this URL — double-check it (404).',
            httpServer: 'The provider is having trouble right now — try again later (5xx).',
            httpOther: 'The provider responded with an error.',
            timeout: 'The provider took too long to respond and the request timed out.',
            corsOrNetwork:
                "This provider's server blocked the request, or a network error occurred. Providers rarely allow direct browser access (CORS) — try downloading the playlist file and uploading it instead, or configure a proxy in Settings → Streaming.",
            offline: 'This device appears to be offline. Check the network connection and try again.',
            mixedContent:
                'This playlist uses an unencrypted (http://) address, which browsers block on a secure (https://) page. Configure a proxy in Settings → Streaming, or use the desktop app, which has no such restriction.',
            tooLarge: 'This is larger than expected and was stopped to protect memory.',
            xtreamCorsOrNetwork:
                "The provider blocked this request, or a network error occurred. Most Xtream providers don't allow direct browser access (CORS) — configure a proxy in Settings → Streaming, and double-check the server address.",
            xtreamMixedContent:
                'This provider uses an unencrypted (http://) address, which browsers block on a secure (https://) page. Configure a proxy in Settings → Streaming, or use the desktop app, which has no such restriction.',
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
            liveFilter: 'Live filter',
            navigation: 'Navigation',
            streaming: 'Streaming',
            playback: 'Playback',
            appearance: 'Appearance',
        },
        liveFilter: {
            countryLabel: 'Country',
            countryAll: 'All countries',
            countryHelp:
                'Matched against the "| NL |"-style prefix your provider puts on channels and categories. Choose "All countries" to keep every channel while still merging duplicates.',
            knownOnly: 'Known channels only',
            knownOnlyHelp:
                'Strict: show only channels in the built-in Dutch/Flemish list. Off by default — a whitelist silently hides regional and newly launched channels the list has never heard of.',
            dropJunk: 'Hide filler channels',
            dropJunkHelp:
                'Removes numbered event slots (VIAPLAY 07, PPV 12…), separator rows and adult entries. Judged on the channel name only — nothing here checks whether a stream is actually alive.',
        },
        navigation: {
            help: 'Choose which buttons appear in the sidebar. Live is always shown.',
            sources: 'Sources',
            categories: 'Categories',
            starred: 'Starred',
            recents: 'Recents',
            guide: 'Guide',
        },
        streaming: {
            proxyLabel: 'Proxy URL template',
            proxyPlaceholder: 'https://my-proxy.example/{url}',
            proxyHelp:
                'Optional. Applied to playlist, EPG, and API requests when set. No public proxy is provided or promised — video segments are fetched separately by the player and remain CORS-bound on the web regardless.',
            proxySave: 'Save',
            proxyInvalid: 'Must be a valid https:// URL (or http://localhost for local testing).',
            proxySaved: 'Saved.',
            refreshNow: 'Refresh channel list',
            refreshHelp:
                'Providers renumber their streams regularly — the list also refreshes itself when older than 6 hours, and after a channel 404s.',
            refreshBusy: 'Refreshing…',
            refreshDone: 'Channel list refreshed.',
            refreshFailed: 'Could not refresh — open the source first, or check its connection details.',
        },
        playback: {
            engine: 'Playback engine',
            engineMpegts: 'MPEG-TS',
            engineHls: 'HLS',
            engineNative: 'Browser',
            engineHelp:
                'Which engine to try first — each falls back to the others, so a wrong choice costs a retry, never playback. Most Xtream providers send a raw MPEG-TS stream (the default). Pick HLS if your provider sends real segmented playlists; Browser hands the stream straight to the OS player (the only option on iPhone/iPad).',
            buffering: 'Buffering',
            bufferingAuto: 'Auto',
            bufferingSmooth: 'Smooth',
            bufferingLowLatency: 'Low latency',
            bufferingHelp:
                'Auto sizes the buffer from your connection and grows it whenever playback actually stalls. Smooth always keeps a few seconds buffered. Low latency stays closest to live but rebuffers on any hiccup — solid networks only.',
        },
        appearance: {
            density: 'Density',
            densityCompact: 'Compact',
            densityComfortable: 'Comfortable',
        },
    },

    list: {
        chooseSource: 'Choose a playlist',
        backToSources: '← Sources',
        allChannels: 'All channels',
        groupsHeading: 'Groups',
        groupsTruncatedTemplate: 'Showing the first {count} groups.',
        radioLabel: 'Radio station',
        noChannels: 'No channels loaded for this source yet.',
        backToGroups: '← Groups',
        playerStop: 'Stop',
        playerFullscreen: 'Full screen',
        playerErrorPrefix: 'Playback failed:',
        signalGood: 'Stream steady',
        signalFair: 'Stream buffering occasionally',
        signalPoor: 'Stream struggling — connection too slow or unstable',
    },

    import: {
        stage: {
            fetching: 'Fetching…',
            reading: 'Reading…',
            parsing: 'Parsing…',
            writing: 'Saving…',
        },
        rowsReadout: '{count} channels…',
        cancel: 'Cancel',
        errors: {
            invalidM3u: 'This does not look like an M3U playlist.',
            duplicateTemplate: 'This looks identical to "{name}" — import anyway?',
            importAnyway: 'Import anyway',
            largeConfirm: 'This is a large paste and may take a moment to parse.',
            continueAnyway: 'Continue anyway',
        },
        retry: 'Retry',
        retryViaProxy: 'Retry via proxy',
        dismiss: 'Dismiss',
        summary: {
            heading: 'Import complete',
            updatedHeading: 'Playlist updated',
            channelsTemplate: '{count} channels',
            channelTemplate: '{count} channel',
            groupsTemplate: '{count} groups',
            groupTemplate: '{count} group',
            radioTemplate: '{count} radio stations',
            radioSingularTemplate: '{count} radio station',
            skippedTemplate: '{count} unreadable entries skipped',
            skippedSingularTemplate: '{count} unreadable entry skipped',
            drmTemplate: '{count} DRM-protected channels detected (not playable yet)',
            drmSingularTemplate: '{count} DRM-protected channel detected (not playable yet)',
            epgTemplate: '{count} EPG sources detected',
            epgSingularTemplate: '{count} EPG source detected',
            openList: 'Open channel list',
            dismiss: 'Dismiss',
        },
        sources: {
            needsReupload: 'Needs re-upload — file contents did not persist on this device.',
            lastRefreshTemplate: 'Last updated {date}',
        },
    },
} as const;
