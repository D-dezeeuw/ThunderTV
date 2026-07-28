import { defineFn, refs, setValue } from 'spektrum';
import { PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { saveXtreamAccount } from './settings.actions';
import { UI_SETTINGS_OPEN } from './ui';
import { UI_WIZARD_OPEN, UI_WIZARD_STEP, shouldOpenWizard, type WizardStep } from './wizard';
import { get } from './typed';

/**
 * The first-run wizard's own action layer. Every field it collects reuses
 * an existing action/setting rather than inventing a parallel one — step 1's
 * language/country `<select>`s are wired to the exact same
 * `settings/setLocale`/`settings/setLiveCountry` `data-fn`s the Settings
 * panel uses (no wrapper needed there), and step 2's Xtream form calls
 * `saveXtreamAccount()` directly, only adding the wizard-dismissal-on-success
 * behavior on top (`wizard/saveXtreamAccount` below).
 */
export function registerWizardActions(): void {
    defineFn('wizard/open', () => {
        openWizard();
    });
    defineFn('wizard/close', () => {
        setValue(UI_WIZARD_OPEN, false);
    });
    defineFn('wizard/skip', () => {
        setValue(UI_WIZARD_OPEN, false);
    });
    defineFn('wizard/nextStep', () => {
        setValue(UI_WIZARD_STEP, 2 satisfies WizardStep);
    });
    defineFn('wizard/backStep', () => {
        setValue(UI_WIZARD_STEP, 1 satisfies WizardStep);
    });
    defineFn('wizard/saveXtreamAccount', () => {
        void saveXtreamAccountAndClose({
            url: refValue('wizardXtreamUrlInput'),
            user: refValue('wizardXtreamUserInput'),
            pass: refValue('wizardXtreamPassInput'),
        });
    });
}

function refValue(name: string): string {
    const el = refs[name];
    return el instanceof HTMLInputElement ? el.value : '';
}

/** Reopens the wizard from Settings (or anywhere else) — always starts back at step 1, and closes the Settings panel it was likely opened from so the two overlays never stack. */
export function openWizard(): void {
    setValue(UI_SETTINGS_OPEN, false);
    setValue(UI_WIZARD_STEP, 1 satisfies WizardStep);
    setValue(UI_WIZARD_OPEN, true);
}

/**
 * Boot-time check (Feature: first-run wizard) — called once
 * `playlist.sources` has actually finished loading from storage
 * (`bootstrap.ts`'s `sweepAndLoadPlaylistSources()`), never before, so an
 * existing user's sources list never flashes the wizard open while it's
 * still the pre-load empty default.
 */
export function openWizardIfNoSources(): void {
    const sources = get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES) ?? [];
    if (shouldOpenWizard(sources)) {
        setValue(UI_WIZARD_STEP, 1 satisfies WizardStep);
        setValue(UI_WIZARD_OPEN, true);
    }
}

/**
 * Thin wrapper (per the task's own framing) around `saveXtreamAccount()` —
 * the exact Settings → Streaming save path — that additionally dismisses
 * the wizard once the save actually succeeded. Never duplicates the
 * validation/import logic itself.
 */
async function saveXtreamAccountAndClose(input: { url: string; user: string; pass: string }): Promise<void> {
    const saved = await saveXtreamAccount(input);
    if (saved) {
        setValue(UI_WIZARD_OPEN, false);
    }
}
