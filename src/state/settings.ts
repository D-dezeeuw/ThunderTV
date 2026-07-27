import { setValue } from 'spektrum';

export const SETTINGS_PROXY_TEMPLATE = 'settings.proxyTemplate';
/** Feature 07.8.3 validation feedback — transient, never persisted. */
export const SETTINGS_PROXY_ERROR = 'settings.proxyError';
/** Feature 07.8.3 success feedback — transient, never persisted; cleared the moment the field is edited again. */
export const SETTINGS_PROXY_SAVED = 'settings.proxySaved';
/** Manual channel-list refresh feedback — transient, never persisted. */
export const SETTINGS_REFRESH_STATE = 'settings.refreshState';

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
    proxyTemplate: string | null;
    proxyError: string | null;
    proxySaved: boolean;
    refreshState: RefreshFeedbackState;
    playbackEngine: PlaybackEngine;
    buffering: BufferingMode;
}

export const SETTINGS_DEFAULTS: SettingsState = {
    proxyTemplate: null,
    proxyError: null,
    proxySaved: false,
    refreshState: 'idle',
    playbackEngine: 'mpegts',
    buffering: 'auto',
};

export function initSettingsState(): void {
    setValue(SETTINGS_PROXY_TEMPLATE, SETTINGS_DEFAULTS.proxyTemplate);
    setValue(SETTINGS_PROXY_ERROR, SETTINGS_DEFAULTS.proxyError);
    setValue(SETTINGS_PROXY_SAVED, SETTINGS_DEFAULTS.proxySaved);
    setValue(SETTINGS_REFRESH_STATE, SETTINGS_DEFAULTS.refreshState);
    setValue(SETTINGS_PLAYBACK_ENGINE, SETTINGS_DEFAULTS.playbackEngine);
    setValue(SETTINGS_BUFFERING, SETTINGS_DEFAULTS.buffering);
}
