/**
 * Saving a VOD title to disk. This is a real adapter member rather than a
 * helper because the two hosts do genuinely different things: the desktop
 * shell streams the file in the main process (native save dialog, no
 * renderer memory involved at all), while the web build has to go through
 * whatever the browser exposes. Same rule as `windowFullscreen` — a new
 * adapter member added when a real consumer needs it, never speculatively
 * (`platform-adapter.ts`'s header).
 *
 * Why a movie can be downloaded at all when a live channel cannot: an
 * Xtream VOD URL (`/movie/{user}/{pass}/{id}.{ext}`) is a static file with
 * a real `Content-Length` and a real end, not the endless transport stream
 * a live channel serves. The proxy already forwards `Range` and passes
 * `content-range`/`accept-ranges`/`content-length` back
 * (`scripts/proxy-server.mjs`), so a ranged transfer needs nothing new
 * there.
 *
 * ## Two phases, because of one browser rule
 *
 * `prepare()` is split from `start()` for a single reason: the web save
 * picker (`showSaveFilePicker`) requires transient user activation, so it
 * must be called from inside the click that asked for the download —
 * before any `await`. A queue, by definition, starts most transfers long
 * after that click. So the destination is chosen up front, at click time,
 * and the transfer itself happens whenever the queue reaches it.
 *
 * Callers must therefore call `prepare()` as the *first* statement of a
 * click handler. `state/downloads.actions.ts` does; anything else added
 * later must too.
 */

/** Where a prepared download will be written. Opaque to callers — only the adapter that produced it interprets it. */
export interface DownloadTarget {
    /** Which mechanism `start()` will use, and therefore whether progress and cancellation are real — see `Capabilities.downloads`. */
    readonly kind: 'managed' | 'handoff';
    /** The name the file will be saved under, for display in the queue. */
    readonly filename: string;
}

export interface DownloadProgress {
    receivedBytes: number;
    /** `null` when the server sent no `Content-Length` — the queue then shows an indeterminate bar rather than a fake percentage. */
    totalBytes: number | null;
}

/**
 * Enum-ish and UI-copy-free, exactly like `VodErrorReason` — the UI stage
 * maps each to its own message (`state/README.md`'s rule).
 *
 * - `network`: the transfer failed or the provider refused it. On a panel
 *   that caps concurrent connections this is what "downloading while
 *   watching" looks like, which is why the queue runs one at a time.
 * - `disk`: the destination could not be written (permission revoked, no
 *   space, the file removed mid-transfer).
 * - `cancelled`: the viewer pressed Cancel. Not an error, but it ends the
 *   transfer the same way, so it travels the same channel.
 */
export type DownloadFailure = 'network' | 'disk' | 'cancelled';

export interface DownloadCallbacks {
    onProgress(progress: DownloadProgress): void;
    onDone(): void;
    onError(reason: DownloadFailure): void;
}

export interface DownloadHandle {
    /** Idempotent — a cancel racing a natural finish must not throw or double-report. */
    cancel(): void;
}

export interface DownloadAdapter {
    /**
     * Chooses a destination. Resolves `null` when the viewer cancels the
     * picker — that is an ordinary outcome, not an error, and nothing is
     * queued.
     *
     * MUST be called synchronously from a user gesture (see this file's
     * header). Adapters that need no gesture still honour the same
     * contract so callers never have to branch.
     */
    prepare(filename: string): Promise<DownloadTarget | null>;
    /**
     * Begins the transfer. Never rejects — every outcome, including
     * failure, arrives through `callbacks`, so a queue runner has exactly
     * one place to advance from.
     */
    start(url: string, target: DownloadTarget, callbacks: DownloadCallbacks): DownloadHandle;
}

/** Strips the characters a filesystem will not take, so a provider title like `Alien: Director's Cut / 4K` still saves. */
export function safeFilename(name: string, extension: string): string {
    const base = name
        .replace(/[/\\?%*:|"<>]/g, ' ')
        // `\p{Cc}` rather than a literal control-character range: the
        // range spelling trips eslint's `no-control-regex`, and a title
        // pasted out of a scraped provider feed really can carry them.
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        // Windows rejects a trailing dot or space outright.
        .replace(/[. ]+$/, '');
    const ext = extension.replace(/^\./, '').toLowerCase();
    const safeBase = base.length > 0 ? base.slice(0, 120) : 'download';
    return ext ? `${safeBase}.${ext}` : safeBase;
}
