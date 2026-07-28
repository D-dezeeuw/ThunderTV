# src/player/

The engine-agnostic player host, the `PlayerEngine` interface, and the
lazy-loaded hls.js/mpegts.js/native engines.

Owners: Phase 10 — Playback Foundation; Phase 11 — HLS & MPEG-TS Engines;
Phase 12 — Player UI: Dock & Theater.

## Radio visualizer

`visualizer/` drives a canvas 2D visualizer over the shared `<video>`
element's Web Audio output — Radio's answer to "something to look at on a
TV" while a station plays. `visualizer/index.ts` owns the Web Audio graph,
canvas sizing, beat detection (`beat-detector.ts`), and preset
cycling/switching; each `visualizer/presets/*.ts` file is one self-contained
preset (its own particle array/offscreen buffer/angle state) implementing
the shared `VisualizerPreset` interface (`visualizer/types.ts`):

- **Radial Spectrum** — rotating, zoom-pulsing, hue-cycling frequency bars.
- **Particle Storm** — particles drifting outward in slow orbits, trailing,
  pulsing size on beat.
- **Kaleidoscope** — one wedge of audio-reactive art, mirrored/rotated
  around the circle.
- **Fractal Tunnel** — a "video feedback" zoom loop (last frame redrawn
  zoomed + rotated) with a nested-squares fractal core injected each frame.

Presets auto-advance every `AUTO_CYCLE_MS`; `player/nextVisualizerPreset`
(`state/player.actions.ts`) skips manually. `bindings.ts` starts/stops the
whole thing whenever `view.radio.active` and `player.active` change, in a
`watch()` kept separate from the attach/detach one so switching views never
restarts the stream. It reads real frequency data only when the audio is
same-origin/CORS-clean, which mpegts.js/hls.js's `blob:` MediaSource URL
satisfies (the default engines); the native-engine fallback still animates,
just without music-reactivity. `player/fullscreen`
(`state/player.actions.ts`) fullscreens `.radio-now-playing` instead of the
video when `ui.activeView === 'radio'`, since Radio's video element carries
no picture (`player.css`'s `.player-shell--radio` rule).
