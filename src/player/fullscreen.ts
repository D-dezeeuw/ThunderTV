/**
 * Cross-vendor fullscreen entry for the player.
 *
 * Vendor prefixes are not optional here. The standard
 * `Element.requestFullscreen` is missing on exactly the browsers this app
 * targets hardest: webOS/Tizen TV browsers and older WebKit ship only
 * `webkitRequestFullscreen`, and iPhone Safari ships neither — it has just
 * the video-element-only `webkitEnterFullscreen`. The previous version
 * called the standard API and silently did nothing when it was absent,
 * which is why the button appeared dead on a TV.
 *
 * Every entry point below is also a *toggle*: pressing it while already
 * fullscreen exits. A TV remote has no reliable Escape key, so a button
 * that can only ever enter fullscreen strands the viewer there.
 *
 * Methods are looked up by name through an index signature rather than as
 * typed members, so the vendor fallback chain stays one small loop instead
 * of a pile of optional-member declarations (and doesn't trip
 * `@typescript-eslint/unbound-method` by referencing methods detached from
 * their receiver).
 */

type Callable = (this: unknown) => unknown;

const REQUEST_METHODS = [
    'requestFullscreen',
    'webkitRequestFullscreen',
    'webkitRequestFullScreen',
    'mozRequestFullScreen',
    'msRequestFullscreen',
] as const;

const EXIT_METHODS = [
    'exitFullscreen',
    'webkitExitFullscreen',
    'webkitCancelFullScreen',
    'mozCancelFullScreen',
    'msExitFullscreen',
] as const;

const ELEMENT_PROPS = [
    'fullscreenElement',
    'webkitFullscreenElement',
    'webkitCurrentFullScreenElement',
    'mozFullScreenElement',
    'msFullscreenElement',
] as const;

/** Invokes the first method in `names` that `host` actually implements; returns whether one was found. Never throws — a rejected promise or a synchronous throw is logged, since there is nothing the caller can do about it. */
function invokeFirst(host: object, names: readonly string[]): boolean {
    const bag = host as Record<string, unknown>;
    for (const name of names) {
        const method = bag[name];
        if (typeof method !== 'function') continue;
        try {
            const result = (method as Callable).call(host);
            if (result instanceof Promise) {
                result.catch((err: unknown) => {
                    console.error(`[ThunderTV] ${name} rejected:`, err);
                });
            }
        } catch (err) {
            console.error(`[ThunderTV] ${name} threw:`, err);
        }
        return true;
    }
    return false;
}

/** The element currently fullscreen, under whichever vendor name this browser uses. */
export function currentFullscreenElement(): Element | null {
    const bag = document as unknown as Record<string, unknown>;
    for (const prop of ELEMENT_PROPS) {
        const value = bag[prop];
        if (value instanceof Element) return value;
    }
    return null;
}

export function exitFullscreen(): void {
    invokeFirst(document, EXIT_METHODS);
}

/**
 * Fullscreens (or exits) a `<video>`. Falls back to iPhone Safari's
 * video-only `webkitEnterFullscreen()` when no element-level API exists —
 * that path has no matching "exit", the native player owns it.
 */
export function requestVideoFullscreen(video: HTMLVideoElement): void {
    if (currentFullscreenElement()) {
        exitFullscreen();
        return;
    }
    if (invokeFirst(video, REQUEST_METHODS)) return;
    const withWebkit = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    withWebkit.webkitEnterFullscreen?.();
}

/**
 * Fullscreens (or exits) a plain element — Radio's player shell, which
 * carries the visualizer canvas *and* its control bar, so the preset
 * picker and pause button stay reachable while fullscreen (see
 * `player.css`'s `:fullscreen` rules). No `webkitEnterFullscreen` fallback:
 * that API is video-element-only.
 */
export function requestElementFullscreen(element: HTMLElement): void {
    if (currentFullscreenElement()) {
        exitFullscreen();
        return;
    }
    invokeFirst(element, REQUEST_METHODS);
}
