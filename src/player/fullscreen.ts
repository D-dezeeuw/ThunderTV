/**
 * Fullscreen entry for the MVP player. Standard `requestFullscreen` covers
 * desktop and Android; iPhone Safari never implemented it on any element
 * and instead exposes the video-only `webkitEnterFullscreen()` — both are
 * tried so the one visible button works everywhere. The native `controls`
 * bar offers its own fullscreen toggle too; this button is the explicit,
 * always-findable affordance.
 */
export function requestVideoFullscreen(video: HTMLVideoElement): void {
    const withWebkit = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (typeof video.requestFullscreen === 'function') {
        video.requestFullscreen().catch(() => {
            withWebkit.webkitEnterFullscreen?.();
        });
        return;
    }
    withWebkit.webkitEnterFullscreen?.();
}

/**
 * Stop's own exit path. Pressing ESC works because the browser's native
 * exit-fullscreen algorithm runs first and repaints the page before any app
 * teardown happens; pressing Stop while still fullscreen skips that
 * algorithm entirely — the `<video>` gets torn down and hidden out from
 * under a browser that still believes it owns the fullscreen layer, leaving
 * that layer stuck on screen with nothing underneath reachable. Called from
 * `stopPlayback()` before the teardown writes so the browser's own exit
 * routine runs instead.
 */
export function exitFullscreenIfActive(): void {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}
