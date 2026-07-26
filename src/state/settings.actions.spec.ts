import { resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { saveProxyTemplate } from './settings.actions';
import { initSettingsState, SETTINGS_PROXY_ERROR, SETTINGS_PROXY_SAVED, SETTINGS_PROXY_TEMPLATE } from './settings';
import { get } from './typed';

/**
 * `settings/saveProxyTemplate` (Feature 07.8.1/07.8.3) — `saveProxyTemplate()`
 * is exported directly for testing (the `defineFn` wrapper only adds
 * reading the raw value off `refs['proxyTemplateInput']`, already covered
 * by the live browser verification recorded in the phase tracker).
 */
describe('saveProxyTemplate() (Feature 07.8.1/07.8.3)', () => {
    afterEach(() => {
        resetState();
    });

    it('saves a valid https:// template and clears any prior error', async () => {
        await withFakePlatform({}, () => {
            initSettingsState();
            saveProxyTemplate('https://my-proxy.example/{url}');
            tick();

            expect(get<string | null>(SETTINGS_PROXY_TEMPLATE)).toBe('https://my-proxy.example/{url}');
            expect(get<string | null>(SETTINGS_PROXY_ERROR)).toBeNull();
            expect(get<boolean>(SETTINGS_PROXY_SAVED)).toBe(true);
        });
    });

    it('accepts http://localhost for local development', async () => {
        await withFakePlatform({}, () => {
            initSettingsState();
            saveProxyTemplate('http://localhost:8080/{url}');
            tick();

            expect(get<string | null>(SETTINGS_PROXY_TEMPLATE)).toBe('http://localhost:8080/{url}');
            expect(get<boolean>(SETTINGS_PROXY_SAVED)).toBe(true);
        });
    });

    it('rejects an invalid template and keeps the previous value (Feature 07.8.3)', async () => {
        await withFakePlatform({}, () => {
            initSettingsState();
            saveProxyTemplate('https://good.example/{url}');
            tick();

            saveProxyTemplate('not-a-url');
            tick();

            expect(get<string | null>(SETTINGS_PROXY_TEMPLATE)).toBe('https://good.example/{url}');
            expect(get<string | null>(SETTINGS_PROXY_ERROR)).toContain('https://');
            expect(get<boolean>(SETTINGS_PROXY_SAVED)).toBe(false);
        });
    });

    it('rejects a plain http:// (non-localhost) template', async () => {
        await withFakePlatform({}, () => {
            initSettingsState();
            saveProxyTemplate('http://insecure.example/{url}');
            tick();

            expect(get<string | null>(SETTINGS_PROXY_TEMPLATE)).toBeNull();
            expect(get<string | null>(SETTINGS_PROXY_ERROR)).not.toBeNull();
        });
    });

    it('an empty/whitespace value clears the template (opting back out)', async () => {
        await withFakePlatform({}, () => {
            initSettingsState();
            saveProxyTemplate('https://good.example/{url}');
            tick();

            saveProxyTemplate('   ');
            tick();

            expect(get<string | null>(SETTINGS_PROXY_TEMPLATE)).toBeNull();
            expect(get<boolean>(SETTINGS_PROXY_SAVED)).toBe(true);
        });
    });
});
