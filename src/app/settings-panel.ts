import { defineFn, refs, setValue, type State } from 'spektrum';

interface UiState extends State {
    ui?: { settingsOpen?: boolean };
}

function isSettingsOpen(state: State): boolean {
    return (state as UiState).ui?.settingsOpen ?? false;
}

let lastFocusedBeforeOpen: HTMLElement | null = null;

/** Double-rAF: `ui.settingsOpen`'s DOM effect (the `data-if` display flip)
 *  applies on Spektrum's next tick (driven by `run()`'s own rAF loop), so
 *  focusing immediately after `setValue` would target a still-hidden,
 *  unfocusable element. Two frames reliably lands after that tick. */
function focusAfterOpen(): void {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            (refs['settingsPanel'] as HTMLElement | undefined)?.focus();
        });
    });
}

/**
 * Registers the settings-panel open/close actions. State lives only in
 * `ui.settingsOpen` (Feature 02.7.2) — the panel markup itself never
 * unmounts `<main>`, so playback (once it exists) keeps running underneath.
 */
export function registerSettingsPanelActions(): void {
    defineFn('toggleSettings', (_el, state) => {
        const opening = !isSettingsOpen(state);
        if (opening) lastFocusedBeforeOpen = document.activeElement as HTMLElement | null;
        setValue('ui.settingsOpen', opening);
        if (opening) focusAfterOpen();
    });

    defineFn('closeSettings', (_el, state) => {
        if (!isSettingsOpen(state)) return;
        setValue('ui.settingsOpen', false);
        lastFocusedBeforeOpen?.focus();
        lastFocusedBeforeOpen = null;
    });
}
