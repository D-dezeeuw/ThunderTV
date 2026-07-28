# src/player/

The engine-agnostic player host, the `PlayerEngine` interface, and the
lazy-loaded hls.js/mpegts.js/native engines.

Owners: Phase 10 — Playback Foundation; Phase 11 — HLS & MPEG-TS Engines;
Phase 12 — Player UI: Dock & Theater.

## Radio visualizer

`visualizer.ts` drives a canvas 2D "radial spectrum" preset (rotation, a
bass-driven zoom pulse, hue cycling) over the shared `<video>` element's Web
Audio output — Radio's answer to "something to look at on a TV" while a
station plays. `bindings.ts` starts/stops it whenever `view.radio.active`
and `player.active` change, in a `watch()` kept separate from the
attach/detach one so switching views never restarts the stream. It reads
real frequency data only when the audio is same-origin/CORS-clean, which
mpegts.js/hls.js's `blob:` MediaSource URL satisfies (the default engines);
the native-engine fallback still animates, just without music-reactivity.
`player/fullscreen` (`state/player.actions.ts`) fullscreens `.radio-now-playing`
instead of the video when `ui.activeView === 'radio'`, since Radio's video
element carries no picture (`player.css`'s `.player-shell--radio` rule).
