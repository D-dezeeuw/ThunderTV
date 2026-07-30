import type {
    DownloadAdapter,
    DownloadCallbacks,
    DownloadHandle,
    DownloadTarget,
} from './download-adapter';
import { isTvWebview } from './tv-webview';

/**
 * The browser's two ways of putting a large file on disk, and why both are
 * here.
 *
 * **File System Access** (`showSaveFilePicker`, Chromium/Edge) is the real
 * one: the response body is piped chunk by chunk into a
 * `FileSystemWritableFileStream`, so a 4 GB movie never exists in memory
 * and the transfer can be measured and cancelled. That is what makes the
 * queue's progress bar and Cancel button honest.
 *
 * **The anchor fallback** (everything else — Firefox, Safari) hands the URL
 * to the browser's own download manager via `<a download>`. There is no
 * progress and no cancel, because the page is no longer involved; the queue
 * marks such an entry finished as soon as it is handed over and says so.
 * The alternative — `fetch()` into a `Blob` and `URL.createObjectURL` — is
 * deliberately NOT used: it buffers the entire file in memory first, which
 * for feature-length video is exactly the failure mode this whole module
 * exists to avoid.
 *
 * The `download` attribute is ignored on a cross-origin URL, so the anchor
 * path only actually saves (rather than navigating) because the caller
 * hands us a proxied, same-origin URL — which is what the desktop build and
 * any proxy-configured web build already produce.
 */

/** Minimal shape of what `showSaveFilePicker` returns — the DOM lib's own types are not in this project's `lib` set. */
interface WritableFileStream {
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
}

interface SaveFileHandle {
    createWritable(): Promise<WritableFileStream>;
}

type SaveFilePicker = (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveFileHandle>;

function savePicker(): SaveFilePicker | null {
    const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
    return typeof picker === 'function' ? picker : null;
}

/**
 * `'managed'` only where the streaming path is actually available — the
 * capability must describe what the host can really do, never what it wishes
 * it could.
 *
 * A TV reports `'none'`. It has no File System Access API, and the
 * `'handoff'` fallback — hand the URL to the browser's download manager —
 * describes a thing a TV webview does not have: there is no download
 * manager, no visible filesystem, and nothing the viewer could do with the
 * file afterwards. Offering the control there is exactly the "a control that
 * cannot work is worse than no control" case `Capabilities.downloads`'
 * `'none'` was defined for, and this is its first real producer.
 */
export function webDownloadSupport(): 'managed' | 'handoff' | 'none' {
    if (isTvWebview()) return 'none';
    return savePicker() ? 'managed' : 'handoff';
}

interface ManagedTarget extends DownloadTarget {
    readonly kind: 'managed';
    readonly handle: SaveFileHandle;
}

export class WebDownloadAdapter implements DownloadAdapter {
    async prepare(filename: string): Promise<DownloadTarget | null> {
        const picker = savePicker();
        if (!picker) return { kind: 'handoff', filename };
        try {
            const handle = await picker({ suggestedName: filename });
            const target: ManagedTarget = { kind: 'managed', filename, handle };
            return target;
        } catch {
            // The spec rejects with AbortError when the viewer dismisses the
            // picker. That is an ordinary "never mind", not a failure worth
            // surfacing, and it is indistinguishable here from a policy
            // refusal — both mean nothing should be queued.
            return null;
        }
    }

    start(url: string, target: DownloadTarget, callbacks: DownloadCallbacks): DownloadHandle {
        if (target.kind === 'handoff') return startHandoff(url, target.filename, callbacks);
        return startManaged(url, target as ManagedTarget, callbacks);
    }
}

/**
 * Hand the URL to the browser and step out of the way. Reported as done
 * immediately and on purpose: once the browser owns the transfer the page
 * cannot observe or stop it, so leaving the entry "downloading" forever
 * would be a progress bar that never moves and a Cancel button that lies.
 */
function startHandoff(url: string, filename: string, callbacks: DownloadCallbacks): DownloadHandle {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    callbacks.onDone();
    return { cancel: () => undefined };
}

function startManaged(url: string, target: ManagedTarget, callbacks: DownloadCallbacks): DownloadHandle {
    const controller = new AbortController();
    let settled = false;
    // One latch for every terminal path — a cancel landing in the same tick
    // as a natural finish must report exactly one outcome, not both.
    const finish = (run: () => void): void => {
        if (settled) return;
        settled = true;
        run();
    };

    void (async () => {
        let writable: WritableFileStream | null = null;
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok || !response.body) {
                finish(() => {
                    callbacks.onError('network');
                });
                return;
            }
            const header = response.headers.get('content-length');
            const totalBytes = header ? Number(header) : null;
            const total = totalBytes !== null && Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : null;

            writable = await target.handle.createWritable();
            const reader = response.body.getReader();
            let receivedBytes = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (controller.signal.aborted) break;
                await writable.write(value);
                receivedBytes += value.byteLength;
                callbacks.onProgress({ receivedBytes, totalBytes: total });
            }

            if (controller.signal.aborted) {
                await writable.abort().catch(() => undefined);
                finish(() => {
                    callbacks.onError('cancelled');
                });
                return;
            }
            await writable.close();
            finish(() => {
                callbacks.onDone();
            });
        } catch (err) {
            // An abort surfaces here too when it lands mid-`fetch` rather
            // than mid-read, so the aborted flag — not the error type — is
            // what distinguishes "the viewer stopped it" from "it broke".
            await writable?.abort().catch(() => undefined);
            const aborted = controller.signal.aborted;
            const reason = aborted ? 'cancelled' : classifyWebFailure(err);
            finish(() => {
                callbacks.onError(reason);
            });
        }
    })();

    return {
        cancel: () => {
            controller.abort();
        },
    };
}

/** A write that fails after the fetch succeeded is a disk problem, not a network one — the queue's message differs, so the distinction has to survive. */
function classifyWebFailure(err: unknown): 'network' | 'disk' {
    const name = err instanceof Error ? err.name : '';
    return name === 'NotAllowedError' || name === 'QuotaExceededError' || name === 'NoModificationAllowedError'
        ? 'disk'
        : 'network';
}
