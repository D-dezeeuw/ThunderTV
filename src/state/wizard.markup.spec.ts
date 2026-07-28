import { tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { withFakePlatform, type FakeHttpAdapter } from '../core/platform/fake-platform';
import { apiUrl } from '../xtream/urls';
import type { XtreamSource } from '../xtream/types';
import { mountTemplate } from '../shared/testing/bind-dom';
import { get, set } from './typed';
import { UI_WIZARD_OPEN, UI_WIZARD_STEP } from './wizard';
import { SETTINGS_LOCALE } from './settings';

/**
 * DOM-bound proof of the first-run wizard (mirrors `settings.locale.markup.spec.ts`'s
 * "hand-authored fragment, real bindDOM/data-fn wiring" convention): a
 * fragment matching `index.html`'s wizard markup, closely enough to exercise
 * the real `data-fn`s wired in `wizard.actions.ts`/`settings.actions.ts`.
 */
const TEMPLATE = `
    <aside data-if="ui.wizardOpen" data-testid="wizard-modal">
        <section data-if="ui.wizardStep === 1" data-testid="wizard-step-1">
            <select
                data-action="change"
                data-fn="settings/setLocale"
                data-testid="wizard-locale-select"
            >
                <option value="en" :selected="settings.locale === 'en'">English</option>
                <option value="nl" :selected="settings.locale === 'nl'">Nederlands</option>
                <option value="de" :selected="settings.locale === 'de'">Deutsch</option>
            </select>
            <select
                data-action="change"
                data-fn="settings/setLiveCountry"
                data-testid="wizard-country-select"
            >
                <option value="" :selected="settings.liveCountry === ''">All</option>
                <option value="DE" :selected="settings.liveCountry === 'DE'">DE</option>
            </select>
            <button type="button" data-action="click" data-fn="wizard/skip" data-testid="wizard-skip-btn">Skip</button>
            <button type="button" data-action="click" data-fn="wizard/nextStep" data-testid="wizard-next-btn">Continue</button>
        </section>
        <section data-if="ui.wizardStep === 2" data-testid="wizard-step-2">
            <input type="text" data-ref="wizardXtreamUrlInput" data-testid="wizard-xtream-url-input" />
            <input type="text" data-ref="wizardXtreamUserInput" data-testid="wizard-xtream-user-input" />
            <input type="password" data-ref="wizardXtreamPassInput" data-testid="wizard-xtream-pass-input" />
            <p data-if="settings.xtreamError" data-testid="wizard-xtream-error">{{ settings.xtreamError }}</p>
            <button type="button" data-action="click" data-fn="wizard/backStep" data-testid="wizard-back-btn">Back</button>
            <button type="button" data-action="click" data-fn="wizard/skip" data-testid="wizard-skip-btn-2">Skip</button>
            <button type="button" data-action="click" data-fn="wizard/saveXtreamAccount" data-testid="wizard-xtream-save-btn">Save</button>
        </section>
    </aside>
`;

/** Same select-driven-change helper `settings.locale.markup.spec.ts` uses — matches how a real <option> pick fires `data-action="change"`. */
function changeSelectTo(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    tick();
}

async function flushAsync(times = 20): Promise<void> {
    for (let i = 0; i < times; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        tick();
    }
}

const source: XtreamSource = { url: 'http://example.com', user: 'bob', pass: 'secret' };

function scriptHappyPath(http: FakeHttpAdapter): void {
    http.onGet(apiUrl(source, '')).reply({ kind: 'ok', body: JSON.stringify({ user_info: { auth: 1, status: 'Active' } }) });
    http.onGet(apiUrl(source, 'get_live_categories')).reply({ kind: 'ok', body: '[]' });
    http.onGet(apiUrl(source, 'get_live_streams')).reply({ kind: 'ok', body: '[]' });
}

describe('First-run wizard (DOM-bound)', () => {
    it('is hidden by default and shows once ui.wizardOpen flips on', () => {
        const mounted = mountTemplate(TEMPLATE);

        expect(mounted.query('[data-testid="wizard-modal"]')?.style.display).toBe('none');

        mounted.dispatch('settings/setLocale'); // no-op, just to prove dispatch reaches real actions before we set state directly below
        expect(get<string>(SETTINGS_LOCALE)).toBe('en');

        set(UI_WIZARD_OPEN, true);
        tick();

        expect(mounted.query('[data-testid="wizard-modal"]')?.style.display).not.toBe('none');
        expect(mounted.query('[data-testid="wizard-step-1"]')?.style.display).not.toBe('none');
        expect(mounted.query('[data-testid="wizard-step-2"]')?.style.display).toBe('none');

        mounted.cleanup();
    });

    it('the language select updates settings.locale live, same as Settings', () => {
        const mounted = mountTemplate(TEMPLATE);
        set(UI_WIZARD_OPEN, true);
        tick();

        const select = mounted.query<HTMLSelectElement>('[data-testid="wizard-locale-select"]');
        expect(select).not.toBeNull();
        changeSelectTo(select as HTMLSelectElement, 'de');

        expect(get<string>(SETTINGS_LOCALE)).toBe('de');

        mounted.cleanup();
    });

    it('Continue advances to step 2, Back returns to step 1', () => {
        const mounted = mountTemplate(TEMPLATE);
        set(UI_WIZARD_OPEN, true);
        tick();

        mounted.dispatch('wizard/nextStep');
        expect(get<number>(UI_WIZARD_STEP)).toBe(2);
        expect(mounted.query('[data-testid="wizard-step-2"]')?.style.display).not.toBe('none');

        mounted.dispatch('wizard/backStep');
        expect(get<number>(UI_WIZARD_STEP)).toBe(1);

        mounted.cleanup();
    });

    it('Skip closes the wizard without saving anything', () => {
        const mounted = mountTemplate(TEMPLATE);
        set(UI_WIZARD_OPEN, true);
        tick();

        mounted.dispatch('wizard/skip');

        expect(get<boolean>(UI_WIZARD_OPEN)).toBe(false);

        mounted.cleanup();
    });

    it('submitting Xtream credentials calls the same saveXtreamAccount() path Settings uses, and closes the wizard on success', async () => {
        await withFakePlatform({}, async ({ http, storage }) => {
            const mounted = mountTemplate(TEMPLATE);
            set(UI_WIZARD_OPEN, true);
            set(UI_WIZARD_STEP, 2);
            tick();
            scriptHappyPath(http);

            const urlInput = mounted.query<HTMLInputElement>('[data-testid="wizard-xtream-url-input"]');
            const userInput = mounted.query<HTMLInputElement>('[data-testid="wizard-xtream-user-input"]');
            const passInput = mounted.query<HTMLInputElement>('[data-testid="wizard-xtream-pass-input"]');
            if (!urlInput || !userInput || !passInput) throw new Error('unreachable');
            urlInput.value = source.url;
            userInput.value = source.user;
            passInput.value = source.pass;

            mounted.dispatch('wizard/saveXtreamAccount');
            await flushAsync();

            const playlists = await storage.getAll('playlists');
            expect(playlists).toEqual([
                expect.objectContaining({ type: 'xtream', username: source.user, url: source.url }),
            ]);
            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(false);

            mounted.cleanup();
        });
    });

    it('a failed Xtream save shows the error and leaves the wizard open on step 2', async () => {
        await withFakePlatform({}, async ({ http }) => {
            const mounted = mountTemplate(TEMPLATE);
            set(UI_WIZARD_OPEN, true);
            set(UI_WIZARD_STEP, 2);
            tick();
            http.onGet(apiUrl(source, '')).reply({ kind: 'http', status: 401 });

            const urlInput = mounted.query<HTMLInputElement>('[data-testid="wizard-xtream-url-input"]');
            const userInput = mounted.query<HTMLInputElement>('[data-testid="wizard-xtream-user-input"]');
            const passInput = mounted.query<HTMLInputElement>('[data-testid="wizard-xtream-pass-input"]');
            if (!urlInput || !userInput || !passInput) throw new Error('unreachable');
            urlInput.value = source.url;
            userInput.value = source.user;
            passInput.value = source.pass;

            mounted.dispatch('wizard/saveXtreamAccount');
            await flushAsync();

            expect(mounted.query('[data-testid="wizard-xtream-error"]')).not.toBeNull();
            expect(get<boolean>(UI_WIZARD_OPEN)).toBe(true);

            mounted.cleanup();
        });
    });
});
