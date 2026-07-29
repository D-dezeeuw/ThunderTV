import type {
    DownloadAdapter,
    DownloadCallbacks,
    DownloadHandle,
    DownloadTarget,
} from './download-adapter';

/**
 * The desktop download path: a native save dialog, and a transfer that runs
 * entirely in the main process (`desktop/main.mjs`), streamed straight to
 * disk. The renderer only ever sees `{received, total}` counters, so a
 * feature-length movie costs the page nothing — no `Blob`, no
 * `ArrayBuffer`, no memory ceiling to hit.
 *
 * This is the one place the app talks to the main process about something
 * other than the proxy origin, and it is here for the reason
 * `platform-adapter.ts` names: a real consumer needed it. The alternative —
 * reusing the web streaming path inside Electron — would work, but it would
 * pull the whole file through the renderer's fetch stack to write it back
 * out through a file handle the renderer had to be granted, for a host that
 * can simply write the file itself.
 *
 * Every outcome arrives on one event channel keyed by download id (see
 * `electron-bridge.types.ts`), so a queue with several prepared entries
 * cannot cross-talk. The subscription is opened lazily on the first
 * `start()` and never torn down: the adapter is a boot-lifetime singleton,
 * and a listener that outlives one transfer is exactly what the next one
 * needs.
 */

interface PendingDownload {
    callbacks: DownloadCallbacks;
    /** Latched so a cancel racing a natural finish reports exactly one outcome. */
    settled: boolean;
}

let nextId = 0;

export class ElectronDownloadAdapter implements DownloadAdapter {
    private readonly pending = new Map<string, PendingDownload>();
    private unsubscribe: (() => void) | null = null;

    async prepare(filename: string): Promise<DownloadTarget | null> {
        const bridge = window.electron?.downloads;
        if (!bridge) return null;
        const filePath = await bridge.prepare(filename);
        // `null` is the viewer dismissing the native dialog — an ordinary
        // "never mind", so nothing is queued and nothing is reported.
        if (!filePath) return null;
        return { kind: 'managed', filename, filePath } as DownloadTarget & { filePath: string };
    }

    start(url: string, target: DownloadTarget, callbacks: DownloadCallbacks): DownloadHandle {
        const bridge = window.electron?.downloads;
        const filePath = (target as DownloadTarget & { filePath?: string }).filePath;
        if (!bridge || !filePath) {
            // Nothing to stream to. Reported rather than thrown so the queue
            // runner advances through its single failure path like any other.
            callbacks.onError('disk');
            return { cancel: () => undefined };
        }

        const id = `dl-${String(++nextId)}`;
        this.pending.set(id, { callbacks, settled: false });
        this.listen();
        bridge.start(id, url, filePath);

        return {
            cancel: () => {
                // Left in `pending` on purpose: main answers every cancel with
                // a terminal `cancelled` event, and that event is what settles
                // and removes the entry. Deleting it here would drop the one
                // message the queue is waiting on.
                if (this.pending.has(id)) bridge.cancel(id);
            },
        };
    }

    private listen(): void {
        if (this.unsubscribe) return;
        const bridge = window.electron?.downloads;
        if (!bridge) return;
        this.unsubscribe = bridge.onEvent((event) => {
            const entry = this.pending.get(event.id);
            if (!entry || entry.settled) return;
            if (event.kind === 'progress') {
                entry.callbacks.onProgress({ receivedBytes: event.receivedBytes, totalBytes: event.totalBytes });
                return;
            }
            entry.settled = true;
            this.pending.delete(event.id);
            if (event.kind === 'done') entry.callbacks.onDone();
            else entry.callbacks.onError(event.reason);
        });
    }
}
