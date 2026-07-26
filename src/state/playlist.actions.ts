import { defineFn, refs, setValue } from 'spektrum';
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
import { persist } from './persist';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { retryLastXtreamImport } from './xtream.actions';

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
    // Retry is shared between the M3U URL and Xtream pipelines — the
    // Xtream retry payload wins when it exists (it's cleared whenever an
    // M3U URL import starts), since `retryLastUrlImport()` would otherwise
    // feed the Xtream server URL through the M3U pipeline.
    defineFn('import/retry', () => {
        if (retryLastXtreamImport()) return;
        void retryLastUrlImport();
    });
    defineFn('import/retryViaProxy', () => {
        if (retryLastXtreamImport()) return;
        void retryLastUrlImport();
    });
    defineFn('import/confirmDuplicate', () => {
        void retryAllowingDuplicate();
    });
    defineFn('import/confirmLargePaste', () => {
        void triggerTextImport(refValue('pasteTextarea'), true);
    });

    // Feature 08.10.6: source-switch entry points — the real load/publish
    // work happens in state/list-load.ts's watch(['playlist.activeSourceId'])
    // subscription, so this stays a plain id write.
    defineFn('playlist/selectSource', (el) => {
        const id = el.dataset['id'];
        if (id) setActiveSourceId(id);
    });
    defineFn('playlist/clearActiveSource', () => {
        setActiveSourceId(null);
    });
}

function refValue(name: string): string {
    const el = refs[name];
    return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : '';
}

/**
 * The source the user is currently browsing (Feature 05.6.2's key, made real
 * by Phase 08). Persisted — "coming back to a playlist should feel like
 * never having left" (Feature 08.6's own framing) extends to *which*
 * playlist, not just its scroll position; Phase 05 left this transient only
 * because no real navigation existed yet to write it.
 */
export function setActiveSourceId(id: string | null): void {
    setValue(PLAYLIST_ACTIVE_SOURCE_ID, id);
    persist(PLAYLIST_ACTIVE_SOURCE_ID);
}
