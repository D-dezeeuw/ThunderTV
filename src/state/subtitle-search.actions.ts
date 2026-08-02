import { defineFn, watch } from 'spektrum';
import { cleanCatalogDisplayName } from './catalog-clean-name';
import { PLAYER_ACTIVE } from './player';
import type { ActiveChannelSnapshot } from './records';
import { seriesMemory } from './series-rows';
import { SETTINGS_LIVE_COUNTRY, SETTINGS_SUBTITLE_LANGUAGE } from './settings';
import { resolveSubtitleLanguage } from './subtitle-language';
import { PLAYER_SUBTITLE_SEARCH, SUBTITLE_SEARCH_DEFAULTS, type SubtitleTarget } from './subtitle-search';
import { get, set } from './typed';
import { vodMemory } from './vod-rows';

/**
 * "Search subtitles online" — the boot-path half.
 *
 * Everything that touches the network, parses a subtitle, or attaches one
 * lives in `subtitle-search.run.ts` and is imported only once the viewer
 * presses the row. `scripts/check-dist.mjs` caps the eager bundle at 100 KiB
 * gzip — a webOS 6 / Chromium 87 SLO rather than a ratchet that can be moved
 * — and `main` already sits at 99.9, so one button in two views has to cost
 * boot approximately nothing.
 *
 * What stays here is what was already on the boot path anyway: the two
 * `defineFn`s the reachability check must see, the reset that has to work
 * whether or not the working chunk ever loaded, and `identify()` — which
 * needs `vod-rows`/`series-rows`, and is eager for the bundling reason
 * `SubtitleTarget`'s own doc records.
 *
 * Manual on purpose. Nothing here runs on its own: a film whose subtitles the
 * viewer is happy with should never spend a request, and a silent background
 * download that attaches the wrong language is exactly the behaviour that
 * makes people distrust a player. One press, one search.
 */

/** Non-null only once the working chunk has actually loaded — which is what makes `clearSubtitleSearch()` free on a session that never used the feature. */
let runtime: typeof import('./subtitle-search.run') | null = null;

async function load(): Promise<typeof import('./subtitle-search.run')> {
    runtime ??= await import('./subtitle-search.run');
    return runtime;
}

export function registerSubtitleSearchActions(): void {
    defineFn('player/searchOnlineSubtitles', () => {
        const target = identify();
        void load().then((module) => module.searchOnlineSubtitles(target));
    });
    defineFn('player/useOnlineSubtitle', (_el, _state, _delta, value: unknown) => {
        if (typeof value !== 'string' && typeof value !== 'number') return;
        const target = identify();
        void load().then((module) => module.useOnlineSubtitle(target, String(value)));
    });
    // Its own watch rather than a line inside `registerTrackSync()`: that
    // would make `player-tracks.actions.ts` import this module while the
    // working chunk already imports `publishTrackLists()` from it, and a
    // cycle between action modules is not worth one function call.
    watch([PLAYER_ACTIVE], () => {
        clearSubtitleSearch();
    });
}

/** Clears the panel — called on every stream change, so a previous film's results never sit under a new one. */
export function clearSubtitleSearch(): void {
    runtime?.forgetResults();
    set(PLAYER_SUBTITLE_SEARCH, SUBTITLE_SEARCH_DEFAULTS);
}

/**
 * What is playing, as a subtitle lookup needs it. `null` for anything that is
 * not a movie or an episode — a live channel, and also a title whose catalog
 * entry has been evicted from memory (a source switch), where falling back to
 * the player-bar name would mean searching for a decorated provider string.
 *
 * Exported for its spec: this is the piece with real branching, and it is
 * pure with respect to everything except the two catalog memories.
 */
export function identify(): SubtitleTarget | null {
    const active = get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE) ?? null;
    if (!active) return null;
    const preferredLanguage = preferredSubtitleLanguage();

    if (active.kind === 'vod' && active.id.startsWith('vod:')) {
        const streamId = Number(active.id.slice('vod:'.length));
        const item = Number.isFinite(streamId) ? vodMemory.findItem(streamId) : undefined;
        if (!item) return null;
        const info = vodMemory.detail(streamId);
        return {
            kind: 'movie',
            playbackId: active.id,
            title: cleanCatalogDisplayName(item.name),
            year: info?.releaseDate ?? item.year ?? null,
            imdbId: info?.imdbId ?? null,
            tmdbId: info?.tmdbId ?? null,
            episode: null,
            preferredLanguage,
        };
    }

    if (active.kind === 'series' && active.series) {
        const { seriesId, season, episode } = active.series;
        const item = seriesMemory.findItem(seriesId);
        if (!item) return null;
        return {
            kind: 'series',
            playbackId: active.id,
            title: cleanCatalogDisplayName(item.name),
            year: item.year ?? null,
            // `get_series_info` returns only the episode map, so there is no
            // series-level imdb/tmdb id to read — a show always takes the
            // title+year rung of the ladder.
            imdbId: null,
            tmdbId: null,
            episode: { season, episode },
            preferredLanguage,
        };
    }

    return null;
}

/** `settings.subtitleLanguage`, resolved the same way the embedded-track auto-pick resolves it. `'off'` still searches in the country's language — pressing the button *is* the request for subtitles, whatever the standing default says. */
function preferredSubtitleLanguage(): string {
    const setting = get<string>(SETTINGS_SUBTITLE_LANGUAGE) ?? 'auto';
    const country = get<string>(SETTINGS_LIVE_COUNTRY) ?? '';
    const resolved = resolveSubtitleLanguage(setting === 'off' ? 'auto' : setting, country);
    return resolved === 'off' ? 'en' : resolved;
}
