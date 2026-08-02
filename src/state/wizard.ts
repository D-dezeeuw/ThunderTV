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

/**
 * The one wizard key that *is* persisted: "first-run setup has already been
 * dealt with on this install." Unlike `ui.wizardOpen`, this must survive a
 * reload — the whole point is that a returning user is never asked again.
 * Set once (`wizard.actions.ts`'s `markSetupComplete()`) when the wizard
 * saves an account, when the user dismisses it, or when boot finds a source
 * already configured; only `wizard/open` (Settings → Streaming) shows the
 * wizard afterwards.
 */
export const UI_SETUP_COMPLETE = 'ui.setupComplete';

/**
 * Which configured source the wizard is *editing*, or `null` for the
 * first-run flow. The Sources tab's configured-source cards open the same
 * modal prefilled from that source's stored `PlaylistRecord`
 * (`source-edit.ts`), so this one id is what makes step 2 an editor rather
 * than a second, parallel form: it re-labels the copy, hides the step-1
 * detour, and routes Save through `applySourceEdit()` instead of
 * `saveXtreamAccount()`. Transient exactly like `ui.wizardOpen` — a reload
 * mid-edit means the edit never happened.
 */
export const UI_WIZARD_EDIT_SOURCE_ID = 'ui.wizardEditSourceId';

export type WizardStep = 1 | 2;

export interface WizardState {
    open: boolean;
    step: WizardStep;
    setupComplete: boolean;
    editSourceId: string | null;
}

export const WIZARD_DEFAULTS: WizardState = {
    open: false,
    step: 1,
    setupComplete: false,
    editSourceId: null,
};

export function initWizardState(): void {
    setValue(UI_WIZARD_OPEN, WIZARD_DEFAULTS.open);
    setValue(UI_WIZARD_STEP, WIZARD_DEFAULTS.step);
    setValue(UI_SETUP_COMPLETE, WIZARD_DEFAULTS.setupComplete);
    setValue(UI_WIZARD_EDIT_SOURCE_ID, WIZARD_DEFAULTS.editSourceId);
}

/**
 * Pure decision function (kept separate from the boot wiring so it's
 * directly unit-testable without a platform/storage fixture): the wizard
 * auto-opens only on an install that has never completed setup *and* has
 * zero sources configured.
 *
 * `setupComplete` is the durable half of that answer — it is rehydrated
 * from storage before this ever runs, so a known configuration keeps the
 * wizard shut even on a boot where `playlist.sources` comes back empty
 * (a demoted storage tier, a cleared `channels` table, a source the user
 * deleted on purpose). `playlist.sources` is itself a live storage
 * projection (`playlist-load.ts`), so this must only be called after that
 * projection has actually loaded — never against the pre-load empty
 * default, or every boot would flash the wizard open.
 */
export function shouldOpenWizard(sources: readonly PlaylistSourceSummary[], setupComplete: boolean): boolean {
    return !setupComplete && sources.length === 0;
}
