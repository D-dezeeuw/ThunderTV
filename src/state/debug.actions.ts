import { defineFn, setValue } from 'spektrum';
import { clearDebugLog, DEBUG_OPEN, debugReportText, refreshDebugSnapshot } from './debug';
import { get } from './typed';

/**
 * The debug panel's controls. Opening recomputes the snapshot rather than
 * watching for it, so a closed panel costs nothing.
 *
 * Ctrl/Cmd+Shift+D is bound globally because the panel has to be reachable
 * when the UI is the thing that is broken — a blank view still has a
 * working keyboard.
 */
export function registerDebugActions(): void {
    defineFn('debug/toggle', () => {
        toggleDebugPanel();
    });
    defineFn('debug/close', () => {
        setValue(DEBUG_OPEN, false);
    });
    defineFn('debug/clear', () => {
        clearDebugLog();
    });
    defineFn('debug/copy', () => {
        void copyDebugReport();
    });
    defineFn('debug/refresh', () => {
        refreshDebugSnapshot();
    });
}

export function toggleDebugPanel(): void {
    const opening = get<boolean>(DEBUG_OPEN) !== true;
    if (opening) refreshDebugSnapshot();
    setValue(DEBUG_OPEN, opening);
}

/**
 * Clipboard access is unavailable on `file://` and in any non-secure
 * context — both of which ThunderTV genuinely runs in (packaged Electron,
 * a LAN-hosted build) — so failure is expected rather than exceptional, and
 * the report stays on screen to be read either way.
 */
async function copyDebugReport(): Promise<void> {
    const text = debugReportText();
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        console.info('[ThunderTV] clipboard unavailable — the report is on screen above');
    }
}

export function registerDebugShortcut(): () => void {
    const onKeydown = (event: KeyboardEvent): void => {
        if (!event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
        if (event.key !== 'D' && event.key !== 'd') return;
        event.preventDefault();
        toggleDebugPanel();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
}
