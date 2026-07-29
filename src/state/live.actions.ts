import { defineFn, watch } from 'spektrum';
import type { Route } from '../app/router';
import { getRows } from '../m3u/channel-memory';
import type { ChannelRow, ChannelVariant } from '../m3u/types';
import { findRowById } from '../ui/virtual-list';
import { FAVORITES_IDS, type FavoriteIdsMap } from './favorites';
import { setDisplayedRows } from './list-rows';
import { ensureLiveRows, ensureRadioRows, invalidateLiveRows, liveDisplayRows, radioDisplayRows } from './live-rows';
import { PLAYER_ACTIVE, PLAYER_ACTIVE_VARIANT_ID, PLAYER_VARIANTS, VARIANTS_CAP } from './player';
import { setActiveChannel } from './player.actions';
import type { ActiveChannelSnapshot } from './records';
import {
    SETTINGS_LIVE_COUNTRY,
    SETTINGS_LIVE_DROP_JUNK,
    SETTINGS_LIVE_KNOWN_ONLY,
} from './settings';
import { get, replace, set } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

/**
 * Live and Categories share one virtual list — two `data-ref="listContainer"`
 * elements would collide in Spektrum's ref registry, and duplicating the
 * windowing machinery for a second list is exactly the kind of weight the
 * Live view exists to remove. Instead, navigating between them republishes
 * a different row set into the same list.
 */
export function registerLiveActions(): void {
    defineFn('live/playVariant', (_el, _state, _delta, _value, event) => {
        const chip = (event?.target as HTMLElement | undefined)?.closest<HTMLElement>('[data-variant-id]');
        const id = chip?.dataset['variantId'];
        if (id) playVariantById(id);
    });
}

/** Rebuilds the Live rows and republishes whichever set the current view wants — called after a settings change that alters the filter. */
export function refreshLiveRows(): void {
    invalidateLiveRows();
    publishRowsForCurrentView();
}

/**
 * Publishes the row set the active view needs. Live shows grouped rows;
 * every other channel-list view (Categories, and the group drill-down it
 * owns) shows the provider's raw rows, because that view's entire purpose
 * is to show the catalog as-shipped.
 */
export function publishRowsForCurrentView(): void {
    const view = get<Route>(UI_ACTIVE_VIEW);
    if (view === 'live') {
        ensureLiveRows();
        setDisplayedRows(liveDisplayRows());
        return;
    }
    if (view === 'radio') {
        ensureRadioRows();
        setDisplayedRows(radioDisplayRows());
        return;
    }
    if (view === 'categories') {
        setDisplayedRows(getRows());
        return;
    }
    if (view === 'favorites') {
        ensureLiveRows();
        setDisplayedRows(favoriteDisplayRows());
    }
}

/**
 * Favorites are keyed on the channel's primary id (see `playVariantById`'s
 * doc comment), so this filters the same grouped rows Live shows rather
 * than the provider's raw dump — a favorite always resolves to its one
 * canonical row regardless of which variant was playing when it was
 * starred.
 */
function favoriteDisplayRows(): ChannelRow[] {
    const ids = get<FavoriteIdsMap>(FAVORITES_IDS) ?? {};
    return liveDisplayRows().filter((row) => ids[row.id]);
}

/**
 * Republishes on every view switch into a channel-list view, and rebuilds
 * whenever a Live filter setting changes. Registered once, from
 * `src/ui/list-bindings.ts` alongside the active-source watch.
 */
export function registerViewRowsWatch(): () => void {
    const stopView = watch([UI_ACTIVE_VIEW], () => {
        publishRowsForCurrentView();
    });
    const stopSettings = watch(
        [SETTINGS_LIVE_COUNTRY, SETTINGS_LIVE_KNOWN_ONLY, SETTINGS_LIVE_DROP_JUNK],
        () => {
            refreshLiveRows();
        },
    );
    const stopFavorites = watch([FAVORITES_IDS], () => {
        if (get<Route>(UI_ACTIVE_VIEW) === 'favorites') publishRowsForCurrentView();
    });
    return () => {
        stopView();
        stopSettings();
        stopFavorites();
    };
}

/**
 * Switches the playing channel to one of its own variants — a different
 * quality, a provider bundle's copy, or the catch-up feed. The row identity
 * (`player.active.id`) deliberately stays the *channel's* primary id so the
 * list highlight and favorites keep pointing at one channel regardless of
 * which feed is playing.
 */
export function playVariantById(variantId: string): void {
    const variants = get<ChannelVariant[]>(PLAYER_VARIANTS) ?? [];
    const variant = variants.find((v) => v.id === variantId);
    const active = get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE);
    if (!variant || !active) return;
    setActiveChannel({ ...active, streamUrl: variant.url });
    set(PLAYER_ACTIVE_VARIANT_ID, variantId);
}

/**
 * Populates the dock's variant strip for a channel about to play. Reads the
 * row out of the virtual list rather than the grouped array so it works
 * identically for Live rows (which carry variants) and every other list
 * (which does not — the strip simply stays empty).
 */
export function publishVariantsFor(id: string, playingUrl: string): void {
    const row = findRowById(id);
    const variants = (row?.variants ?? []).slice(0, VARIANTS_CAP);
    // `replace()` rather than `set()`: Spektrum's setValue deep-merges
    // objects, so a shorter array would otherwise keep the previous
    // channel's trailing variants.
    replace(PLAYER_VARIANTS, variants);
    set(PLAYER_ACTIVE_VARIANT_ID, variants.find((v) => v.url === playingUrl)?.id ?? null);
}

/** Clears the strip when playback stops, and drops the Live cache on source switch. */
export function clearVariants(): void {
    replace(PLAYER_VARIANTS, []);
    set(PLAYER_ACTIVE_VARIANT_ID, null);
}

/** Called from the source-switch path so a new provider never inherits the previous one's grouped rows. */
export function resetLiveForSourceSwitch(): void {
    invalidateLiveRows();
    clearVariants();
}
