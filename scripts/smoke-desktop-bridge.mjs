/**
 * The `window.electron` half of `smoke-desktop.mjs`: what the preload
 * promises, and whether the two localhost servers it advertises are really
 * there.
 *
 * Split out of that file for the reason `desktop/downloads.mjs` was split
 * out of `main.mjs` — the 400-line ceiling — and it splits cleanly: this is
 * the only part of the harness that knows what the bridge *contains*, as
 * opposed to whether the app started at all.
 */

/** The `window.electron` members `src/core/platform/electron-bridge.types.ts` promises. */
export const BRIDGE_CONTRACT = {
    proxyOrigin: 'string',
    appVersion: 'string',
    isWindowFullscreen: 'function',
    setWindowFullscreen: 'function',
    getDefaultConfig: 'function',
    downloads: 'object',
    // `null` in a build whose transcode server didn't start, which is still
    // an object as far as `typeof` is concerned — `checkHostServices()` is
    // what actually proves it came up.
    transcode: 'object',
};
export const DOWNLOAD_BRIDGE_CONTRACT = ['prepare', 'start', 'cancel', 'onEvent'];

/**
 * `desktop/preload.cjs` is hand-kept in sync with `electron-bridge.types.ts`
 * "by review" — nothing else checks it, and a renderer that quietly falls
 * back to the *web* adapter because `window.electron` is missing is a bug
 * this app has already shipped once.
 *
 * Returns the origins the bridge advertises, for `checkHostServices()`.
 */
export async function checkBridge(cdp, record) {
    const bridge = await cdp.evaluate(`
        const b = window.electron;
        if (!b) return { present: false };
        return {
            present: true,
            types: Object.fromEntries(${JSON.stringify(Object.keys(BRIDGE_CONTRACT))}.map((k) => [k, typeof b[k]])),
            downloads: b.downloads ? ${JSON.stringify(DOWNLOAD_BRIDGE_CONTRACT)}.map((k) => typeof b.downloads[k]) : [],
            proxyOrigin: b.proxyOrigin,
            transcodeOrigin: b.transcode ? b.transcode.origin : '',
            transcodeToken: b.transcode ? b.transcode.token : '',
        };
    `);
    record('window.electron bridge is exposed', bridge.present === true, bridge.present ? '' : 'renderer silently fell back to the web adapter');
    if (!bridge.present) return { proxyOrigin: '', transcodeOrigin: '', transcodeToken: '' };

    const wrongTypes = Object.entries(BRIDGE_CONTRACT)
        .filter(([key, expected]) => bridge.types[key] !== expected)
        .map(([key, expected]) => `${key}: expected ${expected}, got ${String(bridge.types[key])}`);
    record('bridge matches ElectronBridge', wrongTypes.length === 0, wrongTypes.join('; '));

    const badDownloads = bridge.downloads.filter((t) => t !== 'function');
    record(
        'downloads bridge exposes all four members',
        bridge.downloads.length === DOWNLOAD_BRIDGE_CONTRACT.length && badDownloads.length === 0,
        bridge.downloads.join(','),
    );

    const proxyOrigin = String(bridge.proxyOrigin ?? '');
    const transcodeOrigin = String(bridge.transcodeOrigin ?? '');
    record('proxy origin is loopback', /^http:\/\/127\.0\.0\.1:\d+$/.test(proxyOrigin), proxyOrigin);
    record('transcode origin is loopback', /^http:\/\/127\.0\.0\.1:\d+$/.test(transcodeOrigin), transcodeOrigin || 'bridge exposed none');
    return { proxyOrigin, transcodeOrigin, transcodeToken: String(bridge.transcodeToken ?? '') };
}

/**
 * The two servers the main process embeds, probed from the renderer itself
 * — the only vantage point where "reachable" means what it needs to mean.
 *
 * Runs *after* the caller has snapshotted the console, because both probes
 * deliberately provoke error statuses that would otherwise be counted as
 * renderer errors of the harness's own making.
 */
export async function checkHostServices(cdp, record, observe, { proxyOrigin, transcodeOrigin, transcodeToken }) {
    // The embedded proxy is the whole reason the desktop build reports
    // `corsUnrestricted: true`; a bridge that came up with no reachable
    // proxy is a desktop app with a web app's limits.
    if (proxyOrigin) {
        // A bare `/` has no target URL, so the worker answers 400 — which is
        // the point: any HTTP status proves the server is listening. Only a
        // thrown fetch means nothing is there.
        const reachable = await cdp.evaluate(`
            try {
                const res = await fetch(${JSON.stringify(proxyOrigin)} + '/', { method: 'GET' });
                return res.status;
            } catch (err) { return 'unreachable: ' + String(err); }
        `);
        record('embedded proxy answers on that origin', typeof reachable === 'number', `HTTP ${String(reachable)}`);
    }

    // The audio transcoder, same shape of check and for the same reason:
    // without a reachable server *with a binary behind it*, a desktop build
    // is back to telling the viewer their film has no sound
    // (`desktop/transcode.mjs`, `src/player/transcode-fallback.ts`).
    // `/status` reports both halves; an untokened `/stream` must be refused,
    // since this one hands a URL to a subprocess.
    if (!transcodeOrigin) return;
    const status = await cdp.evaluate(`
        try {
            const res = await fetch(${JSON.stringify(transcodeOrigin)} + '/status');
            const body = await res.json();
            const denied = await fetch(${JSON.stringify(transcodeOrigin)} + '/stream?src=http%3A%2F%2Fexample%2F1.mkv');
            return { ...body, denied: denied.status };
        } catch (err) { return { error: String(err) }; }
    `);
    record('transcode server answers /status with ffmpeg present', status.ok === true && status.ffmpeg === true, JSON.stringify(status));
    record('transcode server refuses an untokened stream request', status.denied === 403, `HTTP ${String(status.denied)}`);
    observe('transcode token reached the renderer', transcodeToken.length > 0);
}
