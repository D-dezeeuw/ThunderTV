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
