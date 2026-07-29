/**
 * Saving a movie to disk, from the main process.
 *
 * Split out of `main.mjs` because that file sits on eslint's 400-line
 * ceiling — the same "own file, one import back" precedent
 * `src/state/registry-overflow.ts` and `src/app/strings.en.catalog.ts`
 * already set for the identical problem. Anything added to this feature
 * belongs here rather than back in `main.mjs`.
 *
 * NOTE: this file must stay in `electron-builder.yml`'s `files` allowlist.
 * That list is default-deny, so a new `desktop/*.mjs` that nobody adds to it
 * is simply absent from the packaged app, and the failure only shows up at
 * runtime in a distributed build.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// IPC channel names, spelled once and shared with `preload.cjs` by review
// (a sandboxed CommonJS preload can't import from this ESM module).
const IPC_DOWNLOAD_PREPARE = 'thundertv:download-prepare';
const IPC_DOWNLOAD_START = 'thundertv:download-start';
const IPC_DOWNLOAD_CANCEL = 'thundertv:download-cancel';
const IPC_DOWNLOAD_EVENT = 'thundertv:download-event';
/** Progress is coalesced to this cadence — a 4 GB file otherwise fires an IPC message per network chunk for a bar that redraws 60x/s at most. */
const DOWNLOAD_PROGRESS_INTERVAL_MS = 250;

/**
 * Saving a movie to disk, in the main process. An Xtream VOD URL is a
 * static file with a real `Content-Length`, not the endless transport
 * stream a live channel serves, so this is an ordinary streamed GET — the
 * body is piped to a write stream chunk by chunk and never assembled in
 * memory. Doing it here rather than in the renderer is the whole point: a
 * feature-length film costs the page nothing at all.
 *
 * Electron's own `DownloadItem` API (`webContents.downloadURL` +
 * `will-download`) would give progress and cancel for free, but it wants to
 * own the destination decision and reaches the renderer through a different
 * path than the save dialog this already needs. A plain streamed fetch is
 * fewer moving parts for the same result, and it keeps the URL going
 * through the same embedded proxy every other provider request already uses
 * — which is what makes the request leave from this machine's own IP.
 *
 * Every transfer reports on one channel keyed by id, and every terminal
 * outcome is reported exactly once: the queue on the other side advances
 * off that message and would stall forever without it.
 */
const activeDownloads = new Map();

export function registerDownloadHandlers() {
    ipcMain.handle(IPC_DOWNLOAD_PREPARE, async (event, filename) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return null;
        const result = await dialog.showSaveDialog(win, {
            defaultPath: path.join(app.getPath('downloads'), sanitizeSaveName(filename)),
        });
        return result.canceled || !result.filePath ? null : result.filePath;
    });

    ipcMain.on(IPC_DOWNLOAD_START, (event, id, url, filePath) => {
        void runDownload(event.sender, String(id), String(url), String(filePath));
    });

    ipcMain.on(IPC_DOWNLOAD_CANCEL, (_event, id) => {
        // Cancelling an id that already finished is a no-op, not an error:
        // the renderer's cancel can always race a natural completion.
        activeDownloads.get(String(id))?.abort();
    });
}

/** Belt-and-braces against a renderer-supplied name reaching into another directory — `defaultPath` is a real filesystem path, not a display string. */
function sanitizeSaveName(filename) {
    const base = path.basename(String(filename ?? '')).trim();
    return base.length > 0 ? base : 'download';
}

async function runDownload(sender, id, url, filePath) {
    const controller = new AbortController();
    activeDownloads.set(id, controller);

    let settled = false;
    const send = (payload) => {
        if (sender.isDestroyed()) return;
        sender.send(IPC_DOWNLOAD_EVENT, payload);
    };
    const finish = (payload) => {
        if (settled) return;
        settled = true;
        activeDownloads.delete(id);
        send(payload);
    };

    let handle = null;
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok || !response.body) {
            finish({ id, kind: 'error', reason: 'network' });
            return;
        }
        const header = Number(response.headers.get('content-length'));
        const totalBytes = Number.isFinite(header) && header > 0 ? header : null;

        handle = await fs.promises.open(filePath, 'w');
        const stream = handle.createWriteStream();
        let receivedBytes = 0;
        let lastReport = 0;

        for await (const chunk of response.body) {
            if (controller.signal.aborted) break;
            // Honour backpressure — a fast link into a slow disk otherwise
            // queues the whole file in the stream's internal buffer, which
            // is the same unbounded-memory failure this design avoids.
            if (!stream.write(chunk)) {
                await new Promise((resolve) => stream.once('drain', resolve));
            }
            receivedBytes += chunk.length;
            const now = Date.now();
            if (now - lastReport >= DOWNLOAD_PROGRESS_INTERVAL_MS) {
                lastReport = now;
                send({ id, kind: 'progress', receivedBytes, totalBytes });
            }
        }

        await new Promise((resolve, reject) => {
            stream.end(() => {
                resolve();
            });
            stream.on('error', reject);
        });

        if (controller.signal.aborted) {
            await fs.promises.rm(filePath, { force: true });
            finish({ id, kind: 'error', reason: 'cancelled' });
            return;
        }
        // One last progress event so the bar lands on 100% rather than
        // stopping wherever the throttle happened to leave it.
        send({ id, kind: 'progress', receivedBytes, totalBytes });
        finish({ id, kind: 'done' });
    } catch (err) {
        // The aborted flag, not the error type, is what separates "the
        // viewer stopped it" from "it broke" — an abort surfaces as a
        // rejected fetch too.
        if (controller.signal.aborted) {
            await fs.promises.rm(filePath, { force: true }).catch(() => undefined);
            finish({ id, kind: 'error', reason: 'cancelled' });
            return;
        }
        console.error('[ThunderTV] download failed:', err);
        finish({ id, kind: 'error', reason: isDiskError(err) ? 'disk' : 'network' });
    } finally {
        await handle?.close().catch(() => undefined);
        activeDownloads.delete(id);
    }
}

/** A write that fails after the request succeeded is a disk problem, and the renderer's message for it differs — so the distinction has to survive the IPC hop. */
function isDiskError(err) {
    const code = err && typeof err === 'object' ? err.code : undefined;
    return code === 'ENOSPC' || code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || code === 'EISDIR';
}
