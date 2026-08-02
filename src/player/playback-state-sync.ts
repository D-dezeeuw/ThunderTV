import { reportPaused } from '../state/player.actions';
import { reportPlaybackEnded } from '../state/series.actions';

/**
 * Keeps `player.paused` equal to what the `<video>` element is actually
 * doing, by listening to the element's own `play`/`pause` events.
 *
 * This replaces an earlier click handler on the video that implemented
 * tap-to-pause by hand, and it fixes that handler's bug. A `<video controls>`
 * in Chromium already toggles play/pause when its *picture* is clicked — not
 * only its control bar — so a second handler on the same click ran on top of
 * the browser's own toggle: the stream paused and resumed again immediately.
 * The old code reserved a strip at the bottom of the frame to dodge the
 * control buttons, which was the wrong shape of fix, because the surface the
 * browser reacts to is the whole element.
 *
 * So the picture keeps the browser's native behaviour and this only observes
 * it. That is strictly better than intercepting, because it makes *every*
 * route to a pause agree with the UI — the native control bar, a click on the
 * picture, the media keys on a keyboard, the remote's play/pause, and a tap on
 * the audio-only pane. Before this, only the app's own control updated
 * `player.paused`, so pausing from the native controls left the rest of the UI
 * believing the stream was still running.
 *
 * The audio-only pane is unaffected and keeps its explicit binding
 * (`index.html` wires `player/togglePlayback` onto `.radio-now-playing`): a
 * visualizer canvas is not a media element and has no native behaviour to
 * observe or collide with.
 *
 * No feedback loop: `togglePlayback()` writes `player.paused` *and* drives
 * the element, whose event then writes the same value again. Idempotent, and
 * the events are the authority either way.
 */
export function attachPlaybackStateSync(video: HTMLVideoElement): () => void {
    const onPlay = (): void => {
        reportPaused(false);
    };
    const onPause = (): void => {
        reportPaused(true);
    };
    // Feature 21.6.4. Attached here rather than beside `position.ts`'s own
    // `ended` listener because the two want opposite things from the event:
    // that one forgets the position (the programme is over), this one offers
    // what follows. Keeping them separate means neither has to care about
    // the other's ordering.
    const onEnded = (): void => {
        reportPlaybackEnded();
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    return () => {
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('ended', onEnded);
    };
}
