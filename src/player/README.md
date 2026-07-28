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
skips manually and always clears a pin. `bindings.ts` starts/stops the whole
thing and applies the preference whenever `view.radio.active`,
`player.active`, or `player.visualizerPreset` change, in a `watch()` kept
separate from the attach/detach one so switching views or presets never
restarts the stream. It reads real frequency data only when the audio is
same-origin/CORS-clean, which mpegts.js/hls.js's `blob:` MediaSource URL
satisfies (the default engines); the native-engine fallback still animates,
just without music-reactivity. `player/fullscreen`
(`state/player.actions.ts`) fullscreens `.radio-now-playing` instead of the
video when `ui.activeView === 'radio'`, since Radio's video element carries
no picture (`player.css`'s `.player-shell--radio` rule).
