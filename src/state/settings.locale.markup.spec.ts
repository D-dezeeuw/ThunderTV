import { tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { applyLocale } from '../app/strings';
import { mountTemplate } from '../shared/testing/bind-dom';
import { seedStrings } from './index';

/**
 * End-to-end proof the language switcher actually re-renders the DOM: a
 * hand-authored fragment mirroring `index.html`'s locale `<select>` plus a
 * couple of `{{ strings.* }}` bindings, mounted through the real
 * `bindDOM`/`data-action="change"` path (Feature 05.10.3's convention)
 * rather than calling `setLocale()` directly — this is the one spec
 * proving the wiring, not the translation content itself
 * (`strings.spec.ts` owns that).
 */
const TEMPLATE = `
    <select
        id="locale-select"
        data-action="change"
        data-fn="settings/setLocale"
        data-testid="locale-select"
    >
        <option value="en" :selected="settings.locale === 'en'">English</option>
        <option value="nl" :selected="settings.locale === 'nl'">Nederlands</option>
        <option value="de" :selected="settings.locale === 'de'">Deutsch</option>
    </select>
    <span data-testid="rail-live-label">{{ strings.rail.live }}</span>
    <span data-testid="rail-categories-label">{{ strings.rail.categories }}</span>
`;

/** Fires a real 'change' event with the select already set to `value` — matches how a user picking an <option> actually drives Spektrum's data-action="change" binding, unlike the harness's click-based dispatch() (built for buttons/checkboxes, not <select>). */
/**
 * `settings/setLocale` is async now that nl/de dictionaries are lazily
 * imported chunks (app/strings.ts), so the DOM cannot have re-rendered on
 * the same turn the change event fires — drain the import and the resulting
 * Spektrum write before asserting.
 */
async function settleLocaleSwitch(expected: string, testid: string, mounted: { query: (sel: string) => Element | null }): Promise<void> {
    for (let i = 0; i < 100; i++) {
        tick();
        if (mounted.query(`[data-testid="${testid}"]`)?.textContent?.trim() === expected) return;
        // A macrotask, not just a microtask: a dynamic import() settles on
        // the task queue, so draining Promise.resolve() alone never gets there.
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    tick();
}

function changeSelectTo(select: HTMLSelectElement, value: string): void {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    tick();
}

describe('Settings language switcher (i18n, DOM-bound)', () => {
    it('switching the <select> re-renders {{ strings.* }} bindings live, no reload', async () => {
        await applyLocale('en');
        const mounted = mountTemplate(TEMPLATE);
        await seedStrings();
        tick();

        expect(mounted.query('[data-testid="rail-categories-label"]')?.textContent?.trim()).toBe('Categories');

        const select = mounted.query<HTMLSelectElement>('[data-testid="locale-select"]');
        expect(select).not.toBeNull();

        changeSelectTo(select as HTMLSelectElement, 'nl');
        await settleLocaleSwitch('Categorieën', 'rail-categories-label', mounted);

        expect(mounted.query('[data-testid="rail-categories-label"]')?.textContent?.trim()).toBe('Categorieën');
        expect(mounted.query('[data-testid="rail-live-label"]')?.textContent?.trim()).toBe('Live');

        changeSelectTo(select as HTMLSelectElement, 'de');
        await settleLocaleSwitch('Kategorien', 'rail-categories-label', mounted);

        expect(mounted.query('[data-testid="rail-categories-label"]')?.textContent?.trim()).toBe('Kategorien');

        mounted.cleanup();
        await applyLocale('en');
    });
});
