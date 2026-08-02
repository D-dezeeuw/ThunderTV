import { setValue } from 'spektrum';
import type { Locale } from '../app/strings';

export const SETTINGS_PROXY_TEMPLATE = 'settings.proxyTemplate';
/**
 * UI language (Feature 02.6.7 i18n follow-up) — persisted, switchable live
 * from Settings → User. Default `'en'`, the baseline locale
 * `strings.en.ts` ships as the app's original copy.
 */
export const SETTINGS_LOCALE = 'settings.locale';
/** Feature 07.8.3 validation feedback — transient, never persisted. */
export const SETTINGS_PROXY_ERROR = 'settings.proxyError';
/** Feature 07.8.3 success feedback — transient, never persisted; cleared the moment the field is edited again. */
export const SETTINGS_PROXY_SAVED = 'settings.proxySaved';

/**
 * Settings → Streaming's Xtream account fields — lets the credentials that
 * previously only had a way in through the Connect-card import form also be
 * entered/updated from Settings, reusing the very same `importXtreamSource()`
 * upsert (`settings.actions.ts`'s `saveXtreamAccount()`). `xtreamUrl`/
 * `xtreamUsername` are a *prefill* projection of the stored `playlists`
 * table's Xtream row (never itself persisted through the Phase 05 bridge —
 * same "live projection" rule as `playlist.sources`), refreshed at boot and
 * again after a successful save. The password is never prefilled or held in
 * state at all — the field stays blank on load and only overwrites the
 * stored credential when the user types a new, non-empty value.
 */
export const SETTINGS_XTREAM_URL = 'settings.xtreamUrl';
export const SETTINGS_XTREAM_USERNAME = 'settings.xtreamUsername';
/** Transient validation/import feedback — never persisted. */
export const SETTINGS_XTREAM_ERROR = 'settings.xtreamError';
/** Transient success feedback — never persisted; cleared the moment a field is edited again. */
export const SETTINGS_XTREAM_SAVED = 'settings.xtreamSaved';
/** True while the save is authenticating/importing against the provider. */
export const SETTINGS_XTREAM_BUSY = 'settings.xtreamBusy';
/** Manual channel-list refresh feedback — transient, never persisted. */
export const SETTINGS_REFRESH_STATE = 'settings.refreshState';
/** Configuration-export feedback — transient, never persisted. */
export const SETTINGS_EXPORT_STATE = 'settings.exportState';

export type RefreshFeedbackState = 'idle' | 'busy' | 'done' | 'failed';

/** Preferred playback engine — persisted (Settings → Playback). */
export const SETTINGS_PLAYBACK_ENGINE = 'settings.playbackEngine';

/**
 * Which engine to try FIRST; each falls back to the others (see
 * `src/player/engine.ts`'s attempt chain), so a wrong guess costs a retry,
 * never playback.
 *
 * `mpegts` is the default: most Xtream panels serve an endless raw
 * transport stream (their `.m3u8` is only a wrapper), which mpegts.js
 * demuxes to MSE — hls.js rejects those outright. Providers on real
 * segmented HLS still work via the fallback, and `hls` makes them
 * first-try. `native` hands the URL straight to the browser (the only path
 * on iOS, which has no MSE for web content).
 */
export type PlaybackEngine = 'mpegts' | 'hls' | 'native';

export const PLAYBACK_ENGINES: readonly PlaybackEngine[] = ['mpegts', 'hls', 'native'];

/**
 * Buffering trade-off for the MPEG-TS engine.
 *  - `auto` (default): start from the connection's own quality estimate and
 *    grow the buffer whenever real stalls happen (`adaptive-buffer.ts`);
 *  - `smooth`: a fixed deep buffer, no measurement;
 *  - `lowLatency`: no stash, chase the live edge — solid networks only.
 */
export const SETTINGS_BUFFERING = 'settings.buffering';

export type BufferingMode = 'auto' | 'smooth' | 'lowLatency';

export const BUFFERING_MODES: readonly BufferingMode[] = ['auto', 'smooth', 'lowLatency'];

export function isBufferingMode(value: unknown): value is BufferingMode {
    return typeof value === 'string' && (BUFFERING_MODES as readonly string[]).includes(value);
}

export function isPlaybackEngine(value: unknown): value is PlaybackEngine {
    return typeof value === 'string' && (PLAYBACK_ENGINES as readonly string[]).includes(value);
}

/**
 * Rail visibility. The point of the Live view is that one screen answers
 * "what can I watch"; every other destination is optional weight, so each
 * rail button can be switched off. All default **on** — a fresh install
 * must not hide the import flow — and Live itself is never hideable, since
 * hiding every entry would strand the user.
 */
export const SETTINGS_NAV_SOURCES = 'settings.nav.sources';
export const SETTINGS_NAV_CATEGORIES = 'settings.nav.categories';
export const SETTINGS_NAV_RADIO = 'settings.nav.radio';
export const SETTINGS_NAV_STARRED = 'settings.nav.starred';
export const SETTINGS_NAV_RECENTS = 'settings.nav.recents';
export const SETTINGS_NAV_GUIDE = 'settings.nav.guide';
/** Movies/Series rail entries (Phase 21 follow-up) — same default-on, same toggle mechanism as every other rail button above. */
export const SETTINGS_NAV_MOVIES = 'settings.nav.movies';
export const SETTINGS_NAV_SERIES = 'settings.nav.series';

/**
 * Live-view filter. `liveCountry` is the country token kept from the
 * `| NL |` prefix providers put on both channels and categories; `''`
 * disables country filtering entirely (show everything, still grouped).
 */
export const SETTINGS_LIVE_COUNTRY = 'settings.liveCountry';
/**
 * Strict mode — keep only channels the curated catalog knows. **On** by
 * default: the catalog is an explicit, user-chosen shortlist of Dutch
 * channels, so Live is that list and nothing else. Switching it off widens
 * Live to every channel the other filters allow, ordered with the known
 * ones first. Never applies to Radio, which the TV catalog says nothing about.
 */
export const SETTINGS_LIVE_KNOWN_ONLY = 'settings.liveKnownOnly';
/** Drop event-slot placeholders, separators and adult rows. On by default. */
export const SETTINGS_LIVE_DROP_JUNK = 'settings.liveDropJunk';
/**
 * Strict mode — keep only channels the EPG country catalog matched
 * (Phase 31, `src/epg/match.ts`). **Off** by default: a channel not yet
 * matched is far more often "the catalog hasn't caught up" (feed not
 * fetched yet, alias the matcher doesn't know) than "this channel doesn't
 * exist," and hiding it on that guess is the wrong default. Never applies
 * to Radio, which the catalog says nothing about.
 */
export const SETTINGS_LIVE_EPG_VERIFIED_ONLY = 'settings.liveEpgVerifiedOnly';

/** Countries offered in Settings. Anything else can still be typed into the field — this is a shortlist, not a validation gate. */
export const LIVE_COUNTRIES: readonly string[] = ['NL', 'BE', 'DE', 'UK', 'FR', 'ES', 'US'];

/** Preferred audio track language (an ISO 639-1 code, e.g. `'en'`/`'nl'`) — Settings → Playback. Resolution against what a stream actually offers happens in the player layer; this is only the user's stated preference. */
export const SETTINGS_AUDIO_LANGUAGE = 'settings.audioLanguage';
/**
 * Preferred subtitle language — `'auto'` (default: derive from
 * `settings.liveCountry` at use time, never resolved here) or `'off'`, or an
 * explicit ISO 639-1 code. See `subtitle-language.ts`'s
 * `resolveSubtitleLanguage()` for the pure country → language mapping this
 * setting's `'auto'` value defers to.
 */
export const SETTINGS_SUBTITLE_LANGUAGE = 'settings.subtitleLanguage';

/**
 * Whether the "Continue on another device" (handoff) button appears in the
 * player bar. **Off** by default — most viewers never use it, and it was
 * cluttering the bar for everyone; Settings → Playback turns it back on.
 */
export const SETTINGS_SHOW_HANDOFF_BUTTON = 'settings.showHandoffButton';

/**
 * Hide titles from Movies/TV Shows that this device has already proved come
 * out silent — a marker written only after playback measured it (and, on the
 * desktop, after the transcode meant to fix it also failed);
 * `src/player/no-audio-marks.ts` holds the evidence. **Off by default**: a
 * catalog quietly missing entries is a worse bug than a badged entry, and the
 * detail pane's warning is the half that is always on.
 */
export const SETTINGS_HIDE_NO_AUDIO_TITLES = 'settings.hideNoAudioTitles';

/**
 * Mirrors the stored settings blob (masterplan §6.3's `settings` key
 * family). `proxyTemplate` is the only persisted field — density lives
 * under `ui.density` (kept there for continuity with Phase 02 rather than
 * renamed here, see `state/README.md`'s "Existing-key decisions" section)
 * and playback prefs don't exist yet. `proxyError`/`proxySaved` are
 * transient validation feedback (Feature 07.8.1/07.8.3), written by
 * `settings.actions.ts`'s `settings/saveProxyTemplate`. Phase 22 builds
 * the rest of the Settings UI; the Streaming section is real starting here.
 */
export interface SettingsState {
    locale: Locale;
    proxyTemplate: string | null;
    proxyError: string | null;
    proxySaved: boolean;
    xtreamUrl: string;
    xtreamUsername: string;
    xtreamError: string | null;
    xtreamSaved: boolean;
    xtreamBusy: boolean;
    refreshState: RefreshFeedbackState;
    exportState: 'idle' | 'done' | 'failed';
    playbackEngine: PlaybackEngine;
    buffering: BufferingMode;
    nav: NavVisibility;
    liveCountry: string;
    liveKnownOnly: boolean;
    liveDropJunk: boolean;
    liveEpgVerifiedOnly: boolean;
    audioLanguage: string;
    subtitleLanguage: string;
    showHandoffButton: boolean;
    hideNoAudioTitles: boolean;
}

export interface NavVisibility {
    sources: boolean;
    categories: boolean;
    radio: boolean;
    starred: boolean;
    recents: boolean;
    guide: boolean;
    movies: boolean;
    series: boolean;
}

export const SETTINGS_DEFAULTS: SettingsState = {
    locale: 'en',
    proxyTemplate: null,
    proxyError: null,
    proxySaved: false,
    xtreamUrl: '',
    xtreamUsername: '',
    xtreamError: null,
    xtreamSaved: false,
    xtreamBusy: false,
    refreshState: 'idle',
    exportState: 'idle',
    playbackEngine: 'mpegts',
    buffering: 'auto',
    nav: { sources: false, categories: true, radio: true, starred: true, recents: true, guide: true, movies: true, series: true },
    liveCountry: 'NL',
    liveKnownOnly: true,
    liveDropJunk: true,
    liveEpgVerifiedOnly: false,
    audioLanguage: 'en',
    subtitleLanguage: 'auto',
    showHandoffButton: false,
    hideNoAudioTitles: false,
};

export function initSettingsState(): void {
    setValue(SETTINGS_LOCALE, SETTINGS_DEFAULTS.locale);
    setValue(SETTINGS_PROXY_TEMPLATE, SETTINGS_DEFAULTS.proxyTemplate);
    setValue(SETTINGS_PROXY_ERROR, SETTINGS_DEFAULTS.proxyError);
    setValue(SETTINGS_PROXY_SAVED, SETTINGS_DEFAULTS.proxySaved);
    setValue(SETTINGS_XTREAM_URL, SETTINGS_DEFAULTS.xtreamUrl);
    setValue(SETTINGS_XTREAM_USERNAME, SETTINGS_DEFAULTS.xtreamUsername);
    setValue(SETTINGS_XTREAM_ERROR, SETTINGS_DEFAULTS.xtreamError);
    setValue(SETTINGS_XTREAM_SAVED, SETTINGS_DEFAULTS.xtreamSaved);
    setValue(SETTINGS_XTREAM_BUSY, SETTINGS_DEFAULTS.xtreamBusy);
    setValue(SETTINGS_REFRESH_STATE, SETTINGS_DEFAULTS.refreshState);
    setValue(SETTINGS_EXPORT_STATE, SETTINGS_DEFAULTS.exportState);
    setValue(SETTINGS_PLAYBACK_ENGINE, SETTINGS_DEFAULTS.playbackEngine);
    setValue(SETTINGS_BUFFERING, SETTINGS_DEFAULTS.buffering);
    setValue(SETTINGS_NAV_SOURCES, SETTINGS_DEFAULTS.nav.sources);
    setValue(SETTINGS_NAV_CATEGORIES, SETTINGS_DEFAULTS.nav.categories);
    setValue(SETTINGS_NAV_RADIO, SETTINGS_DEFAULTS.nav.radio);
    setValue(SETTINGS_NAV_STARRED, SETTINGS_DEFAULTS.nav.starred);
    setValue(SETTINGS_NAV_RECENTS, SETTINGS_DEFAULTS.nav.recents);
    setValue(SETTINGS_NAV_GUIDE, SETTINGS_DEFAULTS.nav.guide);
    setValue(SETTINGS_NAV_MOVIES, SETTINGS_DEFAULTS.nav.movies);
    setValue(SETTINGS_NAV_SERIES, SETTINGS_DEFAULTS.nav.series);
    setValue(SETTINGS_LIVE_COUNTRY, SETTINGS_DEFAULTS.liveCountry);
    setValue(SETTINGS_LIVE_KNOWN_ONLY, SETTINGS_DEFAULTS.liveKnownOnly);
    setValue(SETTINGS_LIVE_DROP_JUNK, SETTINGS_DEFAULTS.liveDropJunk);
    setValue(SETTINGS_LIVE_EPG_VERIFIED_ONLY, SETTINGS_DEFAULTS.liveEpgVerifiedOnly);
    setValue(SETTINGS_AUDIO_LANGUAGE, SETTINGS_DEFAULTS.audioLanguage);
    setValue(SETTINGS_SUBTITLE_LANGUAGE, SETTINGS_DEFAULTS.subtitleLanguage);
    setValue(SETTINGS_SHOW_HANDOFF_BUTTON, SETTINGS_DEFAULTS.showHandoffButton);
    setValue(SETTINGS_HIDE_NO_AUDIO_TITLES, SETTINGS_DEFAULTS.hideNoAudioTitles);
}
