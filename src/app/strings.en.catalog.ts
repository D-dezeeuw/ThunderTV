/**
 * Movies/Series/Search catalog copy (Phase 21), split out of
 * `strings.en.ts` — that file was pushed over ESLint's 400-line hard
 * ceiling by this addition, the same "split into its own file, merge via
 * one spread" precedent `src/state/registry-overflow.ts` already
 * established for the identical problem (`registry.ts`'s own header
 * explains it). `strings.ts` still treats `en`/`nl`/`de` as complete,
 * single dictionaries — this only changes how `en` gets assembled.
 */
export const enCatalog = {
    /** Shared chrome for the Movies/Series catalog views — status/error/empty/detail copy both views reuse verbatim. */
    catalog: {
        loading: 'Loading…',
        itemsLabel: 'Items',
        noSource: 'Connect an Xtream Codes account to browse this catalog.',
        noSourceAction: 'Open Settings',
        fetchFailed: 'Could not load this catalog. Try again in a moment.',
        noCategories: 'This provider has no categories to show.',
        emptyCategory: 'Nothing in this category yet.',
        close: 'Close',
        play: 'Play',
        retry: 'Retry',
        offline: 'Showing saved data — could not reach the provider. Downloaded titles still play.',
        /** The expand triangle on a category that a provider ships in several country/editorial versions. State is carried by aria-expanded, so one label covers both. */
        variantsToggle: 'Other versions of this category',
    },

    movies: {
        categoriesAria: 'Movie categories',
        detailAria: 'Movie details',
    },

    series: {
        categoriesAria: 'Series categories',
        detailAria: 'Series details',
        seasonPrefix: 'Season',
        episodePrefix: 'E',
        minutesSuffix: 'min',
        noEpisodes: 'No episodes listed for this series yet.',
        nextUpLabel: 'Next up',
        nextPlay: 'Play next',
        nextDismiss: 'Dismiss',
        nextAria: 'Next episode',
    },

    /**
     * Download queue copy. Movies only — a live channel is an endless
     * stream with no end to download to (`src/state/downloads.ts`).
     */
    downloads: {
        action: 'Download',
        queueTitle: 'Downloads',
        queueAria: 'Download queue',
        progressAria: 'Download progress',
        cancel: 'Cancel',
        remove: 'Remove',
        clearFinished: 'Clear finished',
        queued: 'Waiting…',
        starting: 'Starting…',
        done: 'Saved',
        cancelled: 'Cancelled',
        handoff: 'Handed to your browser’s downloads.',
        errorNetwork:
            'The transfer stopped. Providers usually cap how many connections one account can open at once, so stopping playback first often helps.',
        errorDisk: 'Could not write the file. Check the destination still exists and has room.',
    },

    search: {
        placeholder: 'Search titles…',
        clear: 'Clear search',
        scopeAll: 'All',
        scopeChannels: 'Channels',
        scopeMovies: 'Movies',
        scopeSeries: 'Series',
        loadedOnlyHint: 'Searching loaded titles only — open more categories to widen results.',
        /** "Search all": one search across every configured provider's whole catalog (src/state/catalog-sweep.ts). */
        allOff: 'Search all providers',
        allOn: 'Searching all providers — back to this one',
        partialHint: 'Some providers could not be reached, so these results are incomplete.',
        sweepTitle: 'Search every provider',
        sweepWarning:
            'This fetches the complete movie and series catalogue of every provider you have set up. It can take several minutes and moves a lot of data. The result is saved for a day, so the next search is instant.',
        sweepStart: 'Start',
        sweepProviders: 'Providers',
        sweepCategories: 'Categories',
        sweepItems: 'Titles found',
        sweepFailed: 'Could not be reached',
        sweepPartial: 'Finished, but incomplete — some providers were skipped or failed.',
        sweepComplete: 'Done — every provider was covered.',
        sweepCancelled: 'Stopped. Everything fetched so far has been kept.',
    },
    /** The list/grid switch beside each view's search box. */
    layout: {
        group: 'View layout',
        list: 'List view',
        grid: 'Grid view',
    },
} as const;
