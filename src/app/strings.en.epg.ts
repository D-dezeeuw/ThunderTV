/**
 * Phase 31 EPG country-catalog copy, split out of `strings.en.ts` — the
 * same "split into its own file, merge via a spread" precedent
 * `registry-overflow.ts`/`strings.en.catalog.ts` already established.
 * Spread into the nested `live`/`settings.diagnostics`/`settings.liveFilter`
 * objects in `strings.en.ts`, not the top level — those keys already exist
 * there, so this only adds to them rather than replacing them.
 */
export const enEpg = {
    live: {
        /** Same never-empty-screen fallback as `strictFellBack`, for "EPG-verified channels only" — the catalog hasn't matched anything yet, not every channel genuinely lacking guide data. */
        epgFellBack:
            'The EPG catalog has not matched anything here yet, showing all channels. Fetch or refresh the guide data in Settings, or check the selected country.',
    },
    diagnostics: {
        epgCatalogReadout: 'EPG catalog: channels known',
        epgMatchedReadout: '· matched to your list:',
        refreshEpgButton: 'Refresh guide data now',
        refreshEpgHelp:
            'Re-fetches the EPG country catalog and guide data, ignoring the normal refresh schedule — use this after switching country, or if a channel you expect to match still is not.',
        clearEpgCacheButton: 'Clear EPG cache',
        clearEpgCacheHelp:
            'Deletes the stored EPG catalog, guide data, and matching for the selected country, then re-derives it from scratch. Use this if the guide seems stuck on stale data — it survives normal reloads on purpose, so this is the manual reset.',
        epgCacheDone: 'Done.',
        epgCacheFailed: 'Something went wrong — try again in a moment.',
    },
    liveFilter: {
        epgVerifiedOnly: 'EPG-verified channels only',
        epgVerifiedOnlyHelp:
            'Off by default: a channel the EPG catalog has not matched yet is far more often a guide-data gap than a channel that does not exist. Switch this on once your catalog is populated to hide channels with no programme data. Never applies to Radio.',
    },
    /** Spread into `settings.playback` — that block is full too. */
    playback: {
        showHandoffButton: 'Show "Continue on another device" button',
        showHandoffButtonHelp:
            'Adds a button to the player bar for handing the current stream off to another screen. Off by default.',
    },
    list: {
        /** Prefixes the upcoming programme on a channel row: "Then · The Nine O'Clock News". */
        epgNextPrefix: 'Then ·',
        streamLikelyDead: 'This feed has failed most times it was tried recently. It may still work — this is a guess from your own playback history.',
    },
    /** Complete top-level blocks, spread as one line into `strings.<locale>.ts` — that file has no room left for a nested block of its own. */
    topLevel: {
        guide: {
            nowLabel: 'Now',
            detailEmpty: 'Select a programme to see its details here.',
            earlier: 'Earlier',
            later: 'Later',
            backToNow: 'Back to now',
            playChannel: 'Play this channel',
        },
        health: {
            sectionTitle: 'Stream health',
            readout: 'Feeds with playback history:',
            deadReadout: '· probably dead:',
            clearButton: 'Forget stream health',
            clearHelp:
                'Deletes everything ThunderTV has learned about which feeds play and which fail. Only your own playback is ever recorded, and only a credential-free fingerprint of each URL is stored — never your username or password.',
            cleared: 'Stream health forgotten.',
        },
    },
} as const;
