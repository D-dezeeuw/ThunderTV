import { defineFn, refs } from 'spektrum';
import { isValidProxyTemplate } from '../core/http';
import { applyLocale, isLocale, strings } from '../app/strings';
import { getPlatform } from '../core/platform';
import { downloadTextFile } from '../ui/download-file';
import { importXtreamSource } from '../xtream/import';
import { normalizeXtreamUrl } from '../xtream/urls';
import { buildConfigXml } from './config-export';
import { buildEpgXml, buildRawResponsesXml } from './raw-export';
import { loadPlaylistSources } from './playlist-load';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { setActiveSourceId } from './playlist.actions';
import { persist } from './persist';
import {
    isBufferingMode,
    isPlaybackEngine,
    SETTINGS_BUFFERING,
    SETTINGS_EXPORT_STATE,
    SETTINGS_LIVE_COUNTRY,
    SETTINGS_LIVE_DROP_JUNK,
    SETTINGS_LIVE_KNOWN_ONLY,
    SETTINGS_LOCALE,
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
    SETTINGS_XTREAM_BUSY,
    SETTINGS_XTREAM_ERROR,
    SETTINGS_XTREAM_SAVED,
    SETTINGS_XTREAM_URL,
    SETTINGS_XTREAM_USERNAME,
} from './settings';
import { refreshActiveXtreamSource } from './xtream-refresh';
import { toImportErrorKind } from './xtream.actions';
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
    defineFn('settings/saveXtreamAccount', () => {
        void saveXtreamAccount({
            url: refValue('xtreamAccountUrlInput'),
            user: refValue('xtreamAccountUserInput'),
            pass: refValue('xtreamAccountPassInput'),
        });
    });
    defineFn('settings/clearXtreamFeedback', () => {
        set(SETTINGS_XTREAM_ERROR, null);
        set(SETTINGS_XTREAM_SAVED, false);
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
    defineFn('settings/setLocale', (el) => {
        if (el instanceof HTMLSelectElement) setLocale(el.value);
    });
    defineFn('settings/exportConfig', () => {
        exportConfiguration();
    });
    defineFn('settings/exportRaw', () => {
        exportRawResponses();
    });
    defineFn('settings/exportEpg', () => {
        void exportEpg();
    });
}

/** Filename stamp shared by every export, so a set of three files sorts together. */
function stamp(iso: string): string {
    return iso.slice(0, 19).replace(/[:T]/g, '-');
}

/** The provider's replies verbatim — the untransformed counterpart to `exportConfiguration()`. */
export function exportRawResponses(): void {
    try {
        const iso = new Date().toISOString();
        downloadTextFile(
            `thundertv-raw-${stamp(iso)}.xml`,
            'application/xml',
            buildRawResponsesXml({ generatedAt: iso, appVersion: APP_VERSION }),
        );
        set(SETTINGS_EXPORT_STATE, 'done');
    } catch {
        set(SETTINGS_EXPORT_STATE, 'failed');
    }
}

/** Async because the guide lives in storage rather than memory; failures surface in the panel like the other two. */
export async function exportEpg(): Promise<void> {
    try {
        const iso = new Date().toISOString();
        const xml = await buildEpgXml({ generatedAt: iso, appVersion: APP_VERSION });
        downloadTextFile(`thundertv-epg-${stamp(iso)}.xml`, 'application/xml', xml);
        set(SETTINGS_EXPORT_STATE, 'done');
    } catch {
        set(SETTINGS_EXPORT_STATE, 'failed');
    }
}

/**
 * Writes the full configuration to a downloaded XML file. Wrapped in a
 * try/catch because this runs on a click: a storage quirk or an oversized
 * source must surface as "export failed" in the panel, never as an
 * unhandled rejection that leaves the button looking inert.
 */
export function exportConfiguration(): void {
    try {
        const iso = new Date().toISOString();
        const xml = buildConfigXml({ generatedAt: iso, appVersion: APP_VERSION });
        downloadTextFile(`thundertv-config-${stamp(iso)}.xml`, 'application/xml', xml);
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

/**
 * Settings → User's language switcher — updates immediately, no Save step
 * (a `<select>` has no "bad input" the way free text does). Writes both
 * halves of the locale mirror: the persisted `settings.locale` key, the
 * plain-TS `strings` singleton (`applyLocale()`, read live by every
 * selector/action that imports `strings`), and the Spektrum `strings`
 * state key (`{{ }}`/`:attr` template bindings) — the same pair
 * `seedStrings()` keeps in sync at boot. An unrecognised value is a no-op,
 * since the `<select>`'s own options are the only way to reach here.
 */
export function setLocale(raw: string): void {
    if (!isLocale(raw)) return;
    set(SETTINGS_LOCALE, raw);
    persist(SETTINGS_LOCALE);
    applyLocale(raw);
    set('strings', strings);
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

/**
 * Prefills Settings → Streaming's Xtream account fields (URL/username only
 * — never the password, see `settings.ts`'s header comment) from the stored
 * `playlists` table. Same "prefer the active source, fall back to the first
 * Xtream row" resolution `saveXtreamAccount()` uses, so what the panel shows
 * on load is exactly what a blank-password Save would update. Called once
 * at boot (`bootstrap.ts`) and again after a successful save.
 */
export async function loadXtreamAccountPrefill(): Promise<void> {
    const record = await findXtreamAccountRecord();
    set(SETTINGS_XTREAM_URL, record?.url ?? '');
    set(SETTINGS_XTREAM_USERNAME, record?.username ?? '');
}

async function findXtreamAccountRecord() {
    const records = await getPlatform().storage.getAll('playlists');
    const activeId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
    const active = records.find((r) => r.id === activeId && r.type === 'xtream');
    return active ?? records.find((r) => r.type === 'xtream');
}

/**
 * Settings → Streaming's Xtream account fields: an uncontrolled URL/
 * username/password input trio read on Save, exactly like the proxy
 * template field above, so persistence goes through the same validated,
 * read-on-submit path rather than writing per keystroke. Reuses
 * `importXtreamSource()` — the exact upsert the Connect-card import form
 * calls (`xtream.actions.ts`'s `triggerXtreamImport`) — so credentials
 * entered here land in the same `playlists` row and are never duplicated
 * storage logic. A blank password keeps the previously stored one (masked
 * as "•••• (unchanged)" in the field's placeholder); a new source with no
 * prior password requires one. Exported for direct testing without a DOM ref.
 * Returns whether the save actually succeeded — the wizard's step 2
 * (`wizard.actions.ts`'s `wizard/saveXtreamAccount`) uses this return value
 * to decide whether to dismiss itself, rather than re-reading
 * `SETTINGS_XTREAM_SAVED` back out of state immediately afterwards (which,
 * unlike this in-flight boolean, is only current after Spektrum's next
 * `tick()` drains the queued write).
 */
export async function saveXtreamAccount(input: { url: string; user: string; pass: string }): Promise<boolean> {
    set(SETTINGS_XTREAM_ERROR, null);
    set(SETTINGS_XTREAM_SAVED, false);

    const url = normalizeXtreamUrl(input.url);
    const user = input.user.trim();
    if (!url || !user) {
        set(SETTINGS_XTREAM_ERROR, strings.settings.streaming.xtreamMissingFields);
        return false;
    }

    const existing = await findXtreamAccountRecord();
    const pass = input.pass.trim() !== '' ? input.pass : existing?.password;
    if (!pass) {
        set(SETTINGS_XTREAM_ERROR, strings.settings.streaming.xtreamPasswordRequired);
        return false;
    }

    set(SETTINGS_XTREAM_BUSY, true);
    try {
        const outcome = await importXtreamSource({ url, user, pass, name: existing?.name ?? url });
        if (!outcome.ok) {
            set(
                SETTINGS_XTREAM_ERROR,
                (strings.http.failure as Record<string, string>)[toImportErrorKind(outcome.error.kind)] ?? strings.http.failure.httpOther,
            );
            return false;
        }
        await loadPlaylistSources();
        setActiveSourceId(outcome.summary.sourceId);
        set(SETTINGS_XTREAM_URL, url);
        set(SETTINGS_XTREAM_USERNAME, user);
        set(SETTINGS_XTREAM_SAVED, true);
        const passwordInput = refs['xtreamAccountPassInput'];
        if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
        return true;
    } finally {
        set(SETTINGS_XTREAM_BUSY, false);
    }
}
