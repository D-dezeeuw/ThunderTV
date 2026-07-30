/**
 * Tap the picture to pause it.
 *
 * The audio-only pane gets this declaratively (`index.html` binds
 * `player/togglePlayback` straight onto `.radio-now-playing` — a canvas has
 * no controls of its own to compete with). The `<video>` cannot: it carries
 * native `controls`, whose buttons live in a closed shadow root and retarget
 * their clicks to the `<video>` host. A naive listener there would fire on
 * top of the browser's own play/pause handling and toggle twice — a control
 * that visibly does nothing.
 *
 * So clicks landing in the bottom strip, where the native control bar sits,
 * are left alone. The threshold is generous: over-reserving costs a small
 * dead band at the bottom of the picture, while under-reserving reintroduces
 * the double-toggle, and only one of those is a bug.
 */
import { togglePlayback } from '../state/player.actions';

/** Height of the native control bar to keep clear, in CSS pixels. Chromium draws ~40px at desktop sizes and more on a TV; 56 covers both without eating a meaningful part of the frame. */
const NATIVE_CONTROLS_STRIP_PX = 56;

/** Exported for the spec — whether a click at `clientY` should be treated as "on the picture" rather than "on the controls". */
export function isPictureClick(rect: { top: number; bottom: number }, clientY: number): boolean {
    const height = rect.bottom - rect.top;
    // A pane shorter than the strip itself is all controls as far as this is
    // concerned; toggling there would be a coin flip.
    if (height <= NATIVE_CONTROLS_STRIP_PX) return false;
    return clientY < rect.bottom - NATIVE_CONTROLS_STRIP_PX;
}

/** Wires the picture pane. Returns a cleanup function, matching every other `register*`/`attach*` in this codebase. */
export function attachTapToPause(video: HTMLVideoElement): () => void {
    const onClick = (event: MouseEvent): void => {
        if (!isPictureClick(video.getBoundingClientRect(), event.clientY)) return;
        togglePlayback();
    };
    video.addEventListener('click', onClick);
    return () => video.removeEventListener('click', onClick);
}
