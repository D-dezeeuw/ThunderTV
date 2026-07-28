import { defineFn, refs } from 'spektrum';
import { isValidProxyTemplate } from '../core/http';
import { strings } from '../app/strings';
import { downloadTextFile } from '../ui/download-file';
import { buildConfigXml } from './config-export';
import { persist } from './persist';
import {
    isBufferingMode,
    isPlaybackEngine,
    SETTINGS_BUFFERING,
    SETTINGS_EXPORT_STATE,
    SETTINGS_LIVE_COUNTRY,
    SETTINGS_LIVE_DROP_JUNK,
    SETTINGS_LIVE_KNOWN_ONLY,
    SETTINGS_NAV_CATEGORIES,
    SETTINGS_NAV_GUIDE,
    SETTINGS_NAV_RADIO,
    SETTINGS_NAV_RECENTS,
    SETTINGS_NAV_SOURCES,
    SETTINGS_NAV_STARRED,
    SETTINGS_PLAYBACK_ENGINE,
    SETTINGS_PROXY_ERROR,
    SETTINGS_PROXY_SAVED,
    SETTINGS_PROXY_TEMPLATE,
    SETTINGS_REFRESH_STATE,
} from './settings';
import { refreshActiveXtreamSource } from './xtream-refresh';
import { get, set } from './typed';

/**
 * Settings → Streaming's proxy template field (Feature 07.8.1/07.8.3) — an
 * uncontrolled input read imperatively on Save, exactly like the import
 * card's URL/paste fields (`playlist.actions.ts`), so a keystroke never
 * writes an unvalidated template straight into the persisted setting. The
 * field's initial value comes from a one-way `:value="settings.proxyTemplate ?? ''"`
 * binding in `index.html`, which only changes on a successful save — never
 * mid-edit.
 */
export function registerSettingsActions(): void {
    defineFn('settings/saveProxyTemplate', () => {
        saveProxyTemplate(refValue('proxyTemplateInput'));
    });
    defineFn('settings/clearProxyFeedback', () => {
        set(SETTINGS_PROXY_ERROR, null);
        set(SETTINGS_PROXY_SAVED, false);
    });
    // Manual channel-list refresh (masterplan Feature 19.6.4: a
    // user-initiated refresh always enqueues fresh — no TTL, no rate limit).
    defineFn('settings/refreshChannels', () => {
        void runManualRefresh();
    });
    // Same `data-*` button-group shape as ui/setDensity (Feature 02.8).
    defineFn('settings/setPlaybackEngine', (el) => {
        const engine = el.dataset['engine'];
        if (isPlaybackEngine(engine)) {
            set(SETTINGS_PLAYBACK_ENGINE, engine);
            persist(SETTINGS_PLAYBACK_ENGINE);
        }
    });
    defineFn('settings/setBuffering', (el) => {
        const mode = el.dataset['buffering'];
        if (isBufferingMode(mode)) {
            set(SETTINGS_BUFFERING, mode);
            persist(SETTINGS_BUFFERING);
        }
    });
    // One handler for every boolean switch (rail visibility + the two Live
    // filter flags) rather than six near-identical `defineFn`s. The key
    // comes from `data-setting`, resolved through an allowlist so markup can
    // never name an arbitrary state path.
    defineFn('settings/toggle', (el) => {
        toggleSetting(el.dataset['setting']);
    });
    defineFn('settings/setLiveCountry', (el) => {
        if (el instanceof HTMLSelectElement) setLiveCountry(el.value);
    });
    defineFn('settings/exportConfig', () => {
        exportConfiguration();
    });
}

/**
 * Writes the full configuration to a downloaded XML file. Wrapped in a
 * try/catch because this runs on a click: a storage quirk or an oversized
 * source must surface as "export failed" in the panel, never as an
 * unhandled rejection that leaves the button looking inert.
 */
export function exportConfiguration(): void {
    try {
        const stamp = new Date().toISOString();
        const xml = buildConfigXml({ generatedAt: stamp, appVersion: APP_VERSION });
        downloadTextFile(`thundertv-config-${stamp.slice(0, 19).replace(/[:T]/g, '-')}.xml`, 'application/xml', xml);
        set(SETTINGS_EXPORT_STATE, 'done');
    } catch {
        set(SETTINGS_EXPORT_STATE, 'failed');
    }
}

const APP_VERSION = '0.0.0';

/** `data-setting` token → the state key it may write. An allowlist, not a prefix rule: markup must never be able to name an arbitrary path. */
const TOGGLEABLE: Record<string, string> = {
    'nav.sources': SETTINGS_NAV_SOURCES,
    'nav.categories': SETTINGS_NAV_CATEGORIES,
    'nav.radio': SETTINGS_NAV_RADIO,
    'nav.starred': SETTINGS_NAV_STARRED,
    'nav.recents': SETTINGS_NAV_RECENTS,
    'nav.guide': SETTINGS_NAV_GUIDE,
    liveKnownOnly: SETTINGS_LIVE_KNOWN_ONLY,
    liveDropJunk: SETTINGS_LIVE_DROP_JUNK,
};

/** Exported for direct testing without a DOM element. */
export function toggleSetting(token: string | undefined): void {
    const key = token ? TOGGLEABLE[token] : undefined;
    if (!key) return;
    set(key, !(get<boolean>(key) ?? false));
    persist(key);
}

/**
 * `''` is meaningful: it turns country filtering off entirely, so the Live
 * view still groups and de-duplicates but shows every country the provider
 * carries. Anything else is normalized to the uppercase token the parser
 * produces from a `| NL |` prefix.
 */
export function setLiveCountry(raw: string): void {
    set(SETTINGS_LIVE_COUNTRY, raw.trim().toUpperCase());
    persist(SETTINGS_LIVE_COUNTRY);
}

async function runManualRefresh(): Promise<void> {
    set(SETTINGS_REFRESH_STATE, 'busy');
    const outcome = await refreshActiveXtreamSource('manual').catch(() => 'failed' as const);
    set(SETTINGS_REFRESH_STATE, outcome === 'refreshed' ? 'done' : 'failed');
}

function refValue(name: string): string {
    const el = refs[name];
    return el instanceof HTMLInputElement ? el.value : '';
}

/** Exported for direct testing without a DOM ref. */
export function saveProxyTemplate(raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === '') {
        set(SETTINGS_PROXY_TEMPLATE, null);
        persist(SETTINGS_PROXY_TEMPLATE);
        set(SETTINGS_PROXY_ERROR, null);
        set(SETTINGS_PROXY_SAVED, true);
        return;
    }
    if (!isValidProxyTemplate(trimmed)) {
        // Feature 07.8.3: invalid input keeps the previous persisted value.
        set(SETTINGS_PROXY_ERROR, strings.settings.streaming.proxyInvalid);
        set(SETTINGS_PROXY_SAVED, false);
        return;
    }
    set(SETTINGS_PROXY_TEMPLATE, trimmed);
    persist(SETTINGS_PROXY_TEMPLATE);
    set(SETTINGS_PROXY_ERROR, null);
    set(SETTINGS_PROXY_SAVED, true);
}
