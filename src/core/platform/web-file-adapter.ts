import type { FileAdapter, PickedFile, ReadTextResult } from './file-adapter';

/** ~150 MB — a conservative ceiling before the Phase 07/16 chunked worker path exists (Feature 03.7.3). Revisit once M3U/XMLTV files stream through a worker instead of `file.text()`. */
export const READ_TEXT_SIZE_LIMIT_BYTES = 150 * 1024 * 1024;

/** Feature 03.7.4 — exported for the Phase 07 M3U import flow. */
export const M3U_ACCEPT = '.m3u,.m3u8,audio/x-mpegurl,application/x-mpegurl';
/** Feature 03.7.4 — exported for the Phase 16 EPG import flow. */
export const XMLTV_ACCEPT = '.xml,.xml.gz,application/gzip,application/xml,text/xml';

export class WebFileAdapter implements FileAdapter {
    pickFile(accept: string): Promise<PickedFile | null> {
        warnIfNoUserGesture();

        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            // Off-screen, not display:none — some engines skip layout (and
            // therefore the click) for display:none elements.
            input.style.position = 'fixed';
            input.style.top = '-1000px';
            input.style.left = '-1000px';

            let settled = false;
            const settle = (value: PickedFile | null) => {
                if (settled) return;
                settled = true;
                input.removeEventListener('change', onChange);
                input.removeEventListener('cancel', onCancel);
                window.removeEventListener('focus', onFocus);
                input.remove();
                resolve(value);
            };
            const onChange = () => {
                const file = input.files?.[0] ?? null;
                settle(file ? { name: file.name, size: file.size, file } : null);
            };
            const onCancel = () => settle(null);
            // Fallback for engines that don't fire `cancel` (Feature
            // 03.7.2): the window regains focus once the native dialog
            // closes either way, so resolve null shortly after refocus if
            // `change` never fired in the meantime.
            const onFocus = () => {
                window.setTimeout(() => settle(null), 300);
            };

            input.addEventListener('change', onChange);
            input.addEventListener('cancel', onCancel);
            window.addEventListener('focus', onFocus, { once: true });

            document.body.appendChild(input);
            input.click();
        });
    }

    async readText(file: File): Promise<ReadTextResult> {
        if (file.size > READ_TEXT_SIZE_LIMIT_BYTES) {
            return { kind: 'too-large', sizeBytes: file.size, limitBytes: READ_TEXT_SIZE_LIMIT_BYTES };
        }
        return { kind: 'ok', text: await file.text() };
    }
}

/** Browsers silently ignore a programmatic click() without a user gesture rather than throwing (Feature 03.7.7), so this can only be a dev-mode warning, not a hard guard. */
function warnIfNoUserGesture(): void {
    if (typeof document === 'undefined') return;
    const active = document.activeElement;
    const hasLikelyGestureSource = active !== null && active !== document.body;
    if (!hasLikelyGestureSource) {
        console.warn(
            '[ThunderTV] pickFile() was called without an apparent user gesture in focus — the browser may silently ignore the file dialog.',
        );
    }
}
