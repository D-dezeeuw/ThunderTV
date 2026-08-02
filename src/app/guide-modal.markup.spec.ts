import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
import { seedStrings } from '../state/index';
import type { GuideSelectedView } from '../state/guide.selectors';
import { get } from '../state/typed';

/**
 * The Guide's programme-detail modal, as index.html actually binds it —
 * a hand-authored mirror in the same style as `series-detail.markup.spec.ts`,
 * for the same reason: this is a `data-if` over a value that is **null most
 * of the time**, with interpolations reading through it, and neither `tsc`
 * nor a selector spec can tell you whether that binds or throws. The `?.`
 * on the attribute bindings is there because those evaluate even while the
 * dialog is hidden.
 */
const guideModalHtml = `
    <aside data-if="guide.view.selected" :aria-label="guide.view.selected?.title" data-testid="guide-program-modal">
        <p data-testid="guide-modal-channel">{{ guide.view.selected.channelName }}</p>
        <h2 data-testid="guide-modal-title">{{ guide.view.selected.title }}</h2>
        <p data-testid="guide-modal-meta">
            <span data-if="guide.view.selected.isNow" data-testid="guide-modal-badge">{{ strings.guide.nowLabel }}</span>
            <span>{{ guide.view.selected.metaLabel }}</span>
        </p>
        <progress data-if="guide.view.selected.progressPercent >= 0" max="100" :value="guide.view.selected?.progressPercent || 0" data-testid="guide-modal-progress"></progress>
        <p data-if="guide.view.selected.description" data-testid="guide-modal-description">{{ guide.view.selected.description }}</p>
        <p data-if="!guide.view.selected.description" data-testid="guide-modal-no-description">{{ strings.guide.noDescription }}</p>
        <button type="button" data-action="click" data-fn="guide/playSelectedChannel" :data-epg-id="guide.view.selected?.channelId" data-testid="guide-modal-watch-btn"></button>
        <button type="button" data-action="click" data-fn="guide/closeProgram" data-testid="guide-modal-close-btn"></button>
    </aside>
`;

const AIRING: GuideSelectedView = {
    title: 'Journaal',
    description: 'The news.',
    channelName: 'NPO 1',
    channelIcon: null,
    channelId: 'NPO 1.nl',
    metaLabel: 'Thu 15 Jan · 20:00–21:30 · 1 hr 30 min',
    isNow: true,
    progressPercent: 40,
};

const hidden = (el: HTMLElement | null): boolean => el === null || el.style.display === 'none';

describe('Guide programme modal markup (DOM-bound)', () => {
    it('stays hidden — without throwing on the null it reads through — until a programme is selected', async () => {
        const mounted = mountTemplate(guideModalHtml);
        await seedStrings();
        setValue('guide.view', { selected: null });
        tick();

        expect(hidden(mounted.query('[data-testid="guide-program-modal"]'))).toBe(true);

        setValue('guide.view', { selected: AIRING });
        tick();

        const modal = mounted.query('[data-testid="guide-program-modal"]');
        expect(hidden(modal)).toBe(false);
        expect(modal?.getAttribute('aria-label')).toBe('Journaal');
        expect(mounted.query('[data-testid="guide-modal-title"]')?.textContent).toBe('Journaal');
        expect(mounted.query('[data-testid="guide-modal-channel"]')?.textContent).toBe('NPO 1');
        expect(mounted.query('[data-testid="guide-modal-meta"]')?.textContent).toContain('1 hr 30 min');
        expect(hidden(mounted.query('[data-testid="guide-modal-badge"]'))).toBe(false);
        expect(hidden(mounted.query('[data-testid="guide-modal-progress"]'))).toBe(false);
        expect(mounted.query<HTMLButtonElement>('[data-testid="guide-modal-watch-btn"]')?.dataset['epgId']).toBe('NPO 1.nl');

        mounted.cleanup();
    });

    it('says so when the feed carried no synopsis, and hides the progress bar for a programme that is not airing', async () => {
        const mounted = mountTemplate(guideModalHtml);
        await seedStrings();
        setValue('guide.view', { selected: { ...AIRING, description: '', isNow: false, progressPercent: -1 } });
        tick();

        expect(hidden(mounted.query('[data-testid="guide-modal-description"]'))).toBe(true);
        expect(hidden(mounted.query('[data-testid="guide-modal-no-description"]'))).toBe(false);
        expect(hidden(mounted.query('[data-testid="guide-modal-progress"]'))).toBe(true);
        expect(hidden(mounted.query('[data-testid="guide-modal-badge"]'))).toBe(true);

        mounted.cleanup();
    });

    it('the close button clears the selection, which is the whole of closing', () => {
        const mounted = mountTemplate(guideModalHtml);
        setValue('guide.selectedKey', 'NPO 1.nl|123');
        setValue('guide.view', { selected: AIRING });
        tick();

        mounted.dispatch('guide/closeProgram');
        tick();

        expect(get<string | null>('guide.selectedKey')).toBeNull();

        mounted.cleanup();
    });
});
