import { defineFn, refs, setValue } from 'spektrum';
import { persist } from './persist';
import { PLAYLIST_SOURCES, type PlaylistSourceSummary } from './playlist';
import { setActiveSourceId } from './playlist.actions';
import { saveXtreamAccount } from './settings.actions';
import { SETTINGS_XTREAM_ERROR, SETTINGS_XTREAM_SAVED } from './settings';
import { applySourceEdit, findSourceRecord, type SourceEditInput } from './source-edit';
import { UI_SETTINGS_OPEN } from './ui';
import {
    UI_SETUP_COMPLETE,
    UI_WIZARD_EDIT_SOURCE_ID,
    UI_WIZARD_OPEN,
    UI_WIZARD_STEP,
    shouldOpenWizard,
    type WizardStep,
} from './wizard';
import { get, set } from './typed';

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
    defineFn('wizard/skip', () => {
        closeWizard();
    });
    defineFn('wizard/nextStep', () => {
        setValue(UI_WIZARD_STEP, 2 satisfies WizardStep);
    });
    defineFn('wizard/backStep', () => {
        setValue(UI_WIZARD_STEP, 1 satisfies WizardStep);
    });
    defineFn('wizard/saveXtreamAccount', () => {
        const input: SourceEditInput = {
            url: refValue('wizardXtreamUrlInput'),
            user: refValue('wizardXtreamUserInput'),
            pass: refValue('wizardXtreamPassInput'),
        };
        const editing = get<string | null>(UI_WIZARD_EDIT_SOURCE_ID);
        if (editing) void saveSourceEditAndClose(editing, input);
        else void saveXtreamAccountAndClose(input);
    });
    // Feature: a configured source's card in the Sources tab reopens this
    // same wizard as its editor, rather than growing a second form.
    defineFn('sources/edit', (el) => {
        const id = el.dataset['id'];
        if (id) void openSourceEditor(id);
    });
}

function refValue(name: string): string {
    const el = refs[name];
    return el instanceof HTMLInputElement ? el.value : '';
}

/** Reopens the wizard from Settings (or anywhere else) — always starts back at step 1, and closes the Settings panel it was likely opened from so the two overlays never stack. */
export function openWizard(): void {
    setValue(UI_SETTINGS_OPEN, false);
    setValue(UI_WIZARD_EDIT_SOURCE_ID, null);
    setValue(UI_WIZARD_STEP, 1 satisfies WizardStep);
    setValue(UI_WIZARD_OPEN, true);
}

/**
 * Opens the wizard as *this source's* editor: step 2 (the credential form)
 * with the stored server URL and username already in it, the password
 * deliberately blank — the same "a stored password is kept unless replaced"
 * rule Settings → Streaming uses, since prefilling one would mean holding a
 * real credential in the DOM for the length of an edit.
 *
 * The fields are written imperatively through `refs`, not bound: they are
 * uncontrolled inputs (a keystroke must never reach Spektrum state), and
 * `data-if` only toggles `display`, so the modal's inputs exist and are
 * ref-resolved long before it is ever shown.
 *
 * A non-Xtream source has no credentials to edit — an M3U file or paste
 * cannot be re-fetched from anything — so its card keeps doing what every
 * source card in the app has always done and selects the source instead of
 * opening an editor with nothing in it.
 */
export async function openSourceEditor(sourceId: string): Promise<void> {
    const record = await findSourceRecord(sourceId);
    if (!record || record.type !== 'xtream') {
        setActiveSourceId(sourceId);
        return;
    }
    set(SETTINGS_XTREAM_ERROR, null);
    set(SETTINGS_XTREAM_SAVED, false);
    setInputValue('wizardXtreamUrlInput', record.url ?? '');
    setInputValue('wizardXtreamUserInput', record.username ?? '');
    setInputValue('wizardXtreamPassInput', '');
    setValue(UI_WIZARD_EDIT_SOURCE_ID, sourceId);
    setValue(UI_WIZARD_STEP, 2 satisfies WizardStep);
    setValue(UI_WIZARD_OPEN, true);
}

function setInputValue(name: string, value: string): void {
    const el = refs[name];
    if (el instanceof HTMLInputElement) el.value = value;
}

/**
 * Dismissal (Skip/close) counts as "setup dealt with" just as much as a
 * successful save: the user was asked and answered, so the next boot must
 * not ask again. Settings → Streaming's "Run setup wizard again" stays the
 * way back in, so this is never a one-shot trap.
 */
function closeWizard(): void {
    markSetupComplete();
    setValue(UI_WIZARD_EDIT_SOURCE_ID, null);
    setValue(UI_WIZARD_OPEN, false);
}

/**
 * Records "this install is configured" durably. Idempotent, and skips the
 * write entirely when the flag is already set, so the common (returning
 * user) boot path costs one read and no storage traffic.
 */
export function markSetupComplete(): void {
    if (get<boolean>(UI_SETUP_COMPLETE) === true) return;
    setValue(UI_SETUP_COMPLETE, true);
    persist(UI_SETUP_COMPLETE);
}

/**
 * Boot-time check (Feature: first-run wizard) — called once
 * `playlist.sources` has actually finished loading from storage
 * (`bootstrap.ts`'s `sweepAndLoadPlaylistSources()`), never before, so an
 * existing user's sources list never flashes the wizard open while it's
 * still the pre-load empty default.
 *
 * Finding a configured source is also how an install that predates
 * `ui.setupComplete` (or one set up through the Connect card rather than
 * the wizard) gets the flag written — from then on the wizard stays shut
 * regardless of what the sources projection reports.
 */
export function openWizardIfNoSources(): void {
    const sources = get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES) ?? [];
    if (sources.length > 0) {
        markSetupComplete();
        return;
    }
    if (shouldOpenWizard(sources, get<boolean>(UI_SETUP_COMPLETE) ?? false)) {
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
async function saveXtreamAccountAndClose(input: SourceEditInput): Promise<void> {
    const saved = await saveXtreamAccount(input);
    if (saved) {
        markSetupComplete();
        setValue(UI_WIZARD_OPEN, false);
    }
}

/**
 * The edit-mode twin of the above: `applySourceEdit()` does the re-import
 * and the identity bookkeeping, this only decides whether the modal may
 * close. A rejected edit (bad URL, dead credentials) leaves it open on step
 * 2 showing `settings.xtreamError`, so the user can fix the field they got
 * wrong rather than lose the whole edit.
 */
async function saveSourceEditAndClose(sourceId: string, input: SourceEditInput): Promise<void> {
    if (await applySourceEdit(sourceId, input)) {
        setValue(UI_WIZARD_EDIT_SOURCE_ID, null);
        setValue(UI_WIZARD_OPEN, false);
    }
}
