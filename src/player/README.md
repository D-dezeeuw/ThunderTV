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

Four abstract presets:

- **Radial Spectrum** — rotating, zoom-pulsing, hue-cycling frequency bars.
- **Particle Storm** — particles drifting outward in slow orbits, trailing,
  pulsing size on beat.
- **Kaleidoscope** — one wedge of audio-reactive art, mirrored/rotated
  around the circle.
- **Fractal Tunnel** — a "video feedback" zoom loop (last frame redrawn
  zoomed + rotated) with a nested-squares fractal core injected each frame.

Six genre presets — picked by the listener, never inferred from the audio
(there's no genre-classification model here, just six distinct looks tuned
to fit a mood): **EDM** (fast neon rotation, beat rings), **Jazz** (slow
interweaving Lissajous ribbons, warm amber), **Blues** (a single slow
breathing waveform ring, deep indigo), **Rock** (punchy attack/decay spikes,
metallic highlight), **Metal** (jagged red spikes, beat-jolted rotation
reversal, bounded camera shake), **Classical** (independently-rotating
concentric rings, gold/purple).

Presets auto-advance every `AUTO_CYCLE_MS` — unless the listener pins one via
the picker (`index.html`'s `#radio-visualizer-select`, `player.visualizerPreset`
in `state/player.ts`, persisted), in which case only picking `'auto'` again
resumes the rotation. `player/nextVisualizerPreset` (`state/player.actions.ts`)
skips manually and always clears a pin. Every switch — auto-advance, the
picker, or "Next visual" — crossfades over `TRANSITION_MS` rather than
cutting instantly: the outgoing preset keeps rendering into one offscreen
buffer (untouched, so it keeps animating while it fades), the incoming one
(freshly reset) renders into another, and the visible canvas is just the two
alpha-blended each frame (`renderTransition()`).

`player/toggleVisualizerPause` (`player.visualizerPaused`, transient —
always false on a fresh Radio visit) freezes the render loop entirely rather
than blanking the canvas, so the last drawn frame just sits there until
resumed.

`bindings.ts` starts/stops the whole thing and applies the preset/pause
preference whenever `view.radio.active`, `player.active`,
`player.visualizerPreset`, or `player.visualizerPaused` change, in a
`watch()` kept separate from the attach/detach one so none of those ever
restarts the stream. `startRadioVisualizer()` is itself a no-op when already
running against the same canvas — the same `watch()` fires on every one of
those four dependencies, and a full reset on each call would stomp an
in-flight crossfade or the pause state; preset/pause changes apply through
their own setters instead. The visualizer reads real frequency data only
when the audio is same-origin/CORS-clean, which mpegts.js/hls.js's `blob:`
MediaSource URL satisfies (the default engines); the native-engine fallback
still animates, just without music-reactivity. `player/fullscreen`
(`state/player.actions.ts`) fullscreens `.radio-now-playing` instead of the
video when `ui.activeView === 'radio'`, since Radio's video element carries
no picture (`player.css`'s `.player-shell--radio` rule).
