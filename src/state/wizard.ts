import { setValue } from 'spektrum';
import type { PlaylistSourceSummary } from './playlist';

/**
 * First-run setup wizard (masterplan follow-up to Phase 07's Xtream
 * account/Phase 05's locale switcher). Owned by `ui` alongside
 * `ui.settingsOpen`, since both are transient overlay-open flags never
 * meant to survive a reload on their own — `ui.wizardOpen` is computed
 * fresh every boot from whether any source exists (see `wizard.actions.ts`'s
 * `openWizardIfNoSources()`), never persisted directly.
 */
export const UI_WIZARD_OPEN = 'ui.wizardOpen';

/** Two-step flow: 1 = language/country, 2 = Xtream credentials. Reset to 1 every time the wizard (re)opens. */
export const UI_WIZARD_STEP = 'ui.wizardStep';

export type WizardStep = 1 | 2;

export interface WizardState {
    open: boolean;
    step: WizardStep;
}

export const WIZARD_DEFAULTS: WizardState = {
    open: false,
    step: 1,
};

export function initWizardState(): void {
    setValue(UI_WIZARD_OPEN, WIZARD_DEFAULTS.open);
    setValue(UI_WIZARD_STEP, WIZARD_DEFAULTS.step);
}

/**
 * Pure decision function (kept separate from the boot wiring so it's
 * directly unit-testable without a platform/storage fixture): the wizard
 * opens exactly when, after rehydration and the playlist-sources load
 * complete, zero sources are configured. `playlist.sources` is itself a
 * live storage projection (`playlist-load.ts`), so this must only be
 * called after that projection has actually loaded — never against the
 * pre-load empty default, or every boot would flash the wizard open.
 */
export function shouldOpenWizard(sources: readonly PlaylistSourceSummary[]): boolean {
    return sources.length === 0;
}
