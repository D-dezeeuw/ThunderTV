import { defineFn, refs } from 'spektrum';
import { isValidProxyTemplate } from '../core/http';
import { strings } from '../app/strings';
import { persist } from './persist';
import { SETTINGS_PROXY_ERROR, SETTINGS_PROXY_SAVED, SETTINGS_PROXY_TEMPLATE, SETTINGS_REFRESH_STATE } from './settings';
import { refreshActiveXtreamSource } from './xtream-refresh';
import { set } from './typed';

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
}

async function runManualRefresh(): Promise<void> {
    set(SETTINGS_REFRESH_STATE, 'busy');
    const refreshed = await refreshActiveXtreamSource('manual').catch(() => false);
    set(SETTINGS_REFRESH_STATE, refreshed ? 'done' : 'failed');
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
