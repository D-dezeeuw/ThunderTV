import { defineFn, refs } from 'spektrum';
import { resetImportState } from './import-setters';
import {
    cancelCurrentImport,
    retryAllowingDuplicate,
    retryLastUrlImport,
    triggerFileImport,
    triggerFileImportFromFile,
    triggerTextImport,
    triggerUrlImport,
} from './import-triggers';

/**
 * The real Phase 07 import triggers (Feature 07.1.9/07.9.1), replacing the
 * Feature 03.7.10 file-picker proof this module held through Phase 05. URL
 * and paste both read their input imperatively via `refs` on submit —
 * uncontrolled, no `data-model` binding (Feature 07.3.1) — so a 100k-line
 * paste never touches Spektrum state or its time-travel history (§5.8).
 * The async orchestration itself lives in `import-triggers.ts`; this file
 * stays thin `defineFn` registration + the DOM bits that need a raw event
 * (paste's Ctrl/Cmd+Enter shortcut, Feature 07.3.10 — Spektrum's action
 * modifiers cover Enter/Escape/Tab/Shift/Cmd but not Ctrl, so the Ctrl
 * check happens by hand against the real `KeyboardEvent`).
 */
export function registerPlaylistActions(): void {
    defineFn('playlist/importFile', () => {
        void triggerFileImport();
    });
    defineFn('playlist/importUrl', () => {
        void triggerUrlImport(refValue('urlInput'));
    });
    defineFn('playlist/importText', () => {
        void triggerTextImport(refValue('pasteTextarea'));
    });
    defineFn('playlist/handlePasteKeydown', (el, _state, _delta, _value, event) => {
        const ke = event as KeyboardEvent | undefined;
        if (!ke || (!ke.ctrlKey && !ke.metaKey) || !(el instanceof HTMLTextAreaElement)) return;
        ke.preventDefault();
        void triggerTextImport(el.value);
    });
    // Feature 07.2.7: dragover's own preventDefault() (making the card a
    // valid drop target at all) is wired once, globally, in bootstrap.ts —
    // see that file's comment for why one element can't carry both.
    defineFn('playlist/handleDrop', (_el, _state, _delta, _value, event) => {
        const file = (event as DragEvent | undefined)?.dataTransfer?.files[0];
        if (file) void triggerFileImportFromFile(file);
    });
    defineFn('import/cancel', () => {
        cancelCurrentImport();
    });
    defineFn('import/clearSummary', () => {
        resetImportState();
    });
    defineFn('import/retry', () => {
        void retryLastUrlImport();
    });
    defineFn('import/retryViaProxy', () => {
        void retryLastUrlImport();
    });
    defineFn('import/confirmDuplicate', () => {
        void retryAllowingDuplicate();
    });
    defineFn('import/confirmLargePaste', () => {
        void triggerTextImport(refValue('pasteTextarea'), true);
    });
}

function refValue(name: string): string {
    const el = refs[name];
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : '';
}
