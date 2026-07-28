# src/player/

The engine-agnostic player host, the `PlayerEngine` interface, and the
lazy-loaded hls.js/mpegts.js/native engines.

Owners: Phase 10 — Playback Foundation; Phase 11 — HLS & MPEG-TS Engines;
Phase 12 — Player UI: Dock & Theater.

## Audio/subtitle tracks

`player-engine.ts` defines `PlayerEngine`'s track-control members
(`getTracks?`/`setAudioTrack?`/`setSubtitleTrack?`/`onTracksChanged?`) — all
optional, since mpegts.js exposes none of it and the native fallback only
partial. `tracks.ts` has the engine-agnostic `MediaTrack`/`TrackSnapshot`
types. `engine.ts` holds one `PlayerEngine` per attach attempt (built the
moment that attempt starts, torn down alongside it via `detachEngines()`)
and dispatches `getPlayerTracks()`/`setAudioTrack()`/`setSubtitleTrack()`/
`onTracksChanged()` (all exported from there) to whichever is current —
that dispatch, not the interface, is what a state/UI layer should import.

Per-engine support: hls.js (`hls-tracks.ts`) maps `hls.audioTracks`/
`hls.subtitleTracks` in full, switching via `hls.audioTrack`/
`hls.subtitleTrack` (subtitles off = index `-1` and `subtitleDisplay =
false`); native (`native-tracks.ts`) is feature-detected — audio only where
the browser exposes Safari's non-standard `video.audioTracks`, subtitles via
the standard `video.textTracks` (`kind` `subtitles`/`captions`; off = every
track's `mode` set to `'disabled'`) — both APIs absent means an empty,
correct-and-expected snapshot; mpegts.js has no track-switching API at all,
so its `PlayerEngine` only implements `getTracks()` (always empty) and skips
the setters/`onTracksChanged` entirely. `track-prefs.ts` is the pure
preference resolver (`normalizeLangCode`, `pickDefaultAudioTrack`,
`pickDefaultSubtitleTrack`), engine/Spektrum-free by design.

The state/UI stage this section used to describe as "later" is
`src/state/player-tracks.ts`/`player-tracks.actions.ts` (`state/README.md`'s
module table). `registerTrackSync()` there is the one piece that reaches
into this folder from `src/state/`: it subscribes to `onTracksChanged()`,
republishes `player.audioTracks`/`player.subtitleTracks` (compact
`MediaTrack[]`, capped), and applies `track-prefs.ts`'s picks against
`settings.audioLanguage`/`resolveSubtitleLanguage(settings.subtitleLanguage,
settings.liveCountry)` exactly once per stream — keyed on `player.active`'s
`id`+`streamUrl` together (not `id` alone), since `live/playVariant` keeps
the row id but hands the engine a new `streamUrl` and genuinely re-attaches.
A later `onTracksChanged` firing for the *same* stream only republishes, so
it never re-applies over a manual pick the viewer already made through the
dock's two track-menu buttons (`index.html`'s `.player-shell__bar`,
`icon-audio-tracks`/`icon-subtitles`) — each opens a small popup
(`.track-menu`, `src/styles/player.css`) positioned above the dock, with a
fixed "Off" row at the top of the subtitle menu and an explicit dashed empty
row when a stream offers no tracks of that kind, rather than hiding the
buttons.

## Radio visualizer

`visualizer/` drives a canvas 2D visualizer over the shared `<video>`
element's Web Audio output — Radio's answer to "something to look at on a
TV" while a station plays. `visualizer/index.ts` owns the Web Audio graph,
canvas sizing, and preset cycling/switching; `audio-features.ts` turns the
raw spectrum into what presets actually consume (log-spaced bars over
35 Hz–11 kHz plus bass/mid/treble bands, all auto-gained so 1.0 means
"loud for this station" whether the stream is mastered hot or quiet —
without this, loud streams pinned the analyser bytes flat at the ceiling
and quiet ones never moved, which read as "the visualizers don't work");
`beat-detector.ts` flags bass onsets with a 0..1 intensity presets scale
their reactions by; `crossfade.ts` blends preset switches. Each
`visualizer/presets/*.ts` file is one self-contained preset (its own
particle array/offscreen buffer/angle state) implementing the shared
`VisualizerPreset` interface (`visualizer/types.ts`):

Four abstract presets:

- **Radial Spectrum** — rotating, zoom-pulsing, hue-cycling frequency bars
  (mirrored sampling, beat-punched zoom, beat flash ring).
- **Particle Storm** — particles drifting outward in slow orbits, trailing,
  each sized by its own spectrum slice; beats pulse the field and fling
  bursts from the center.
- **Kaleidoscope** — one wedge of audio-reactive lacework (rays, band arcs,
  beat starbursts), mirrored/rotated around the circle; beats kick the spin.
- **Fractal Tunnel** — a "video feedback" zoom loop (last frame redrawn
  zoomed + rotated, gently fading) with a nested-squares core, a
  spectrum-star, and a beat ring the zoom races down the tunnel.

Six genre presets — picked by the listener, never inferred from the audio
(there's no genre-classification model here, just six distinct looks tuned
to fit a mood): **EDM** (dual counter-rotating neon bar rings, kick
scale-punch, beat rings), **Jazz** (interweaving Lissajous ribbons with
treble-chasing comet dots and beat syncopation, warm amber), **Blues** (an
oscilloscope ring drawn from the actual waveform, deep indigo), **Rock**
(attack/decay spikes with metallic highlights, ember sprays off the tips on
beats), **Metal** (jagged red spikes, beat-jolted rotation reversal,
bounded shake, lightning strikes on hard hits), **Classical** (concentric
rings each rippling with its own orchestral register, drifting golden
motes).

Presets auto-advance every `AUTO_CYCLE_MS` — unless the listener pins one via
the picker (`index.html`'s `#radio-visualizer-select`, `player.visualizerPreset`
in `state/player.ts`, persisted), in which case only picking `'auto'` again
resumes the rotation. `player/nextVisualizerPreset` (`state/player.actions.ts`)
skips manually and always clears a pin. Every switch — auto-advance, the
picker, or "Next visual" — crossfades rather than cutting instantly: the
outgoing preset keeps rendering into one offscreen buffer (seeded from the
frame on screen, so trail-based looks carry into the fade instead of
dipping to black), the incoming one (freshly reset) renders into another,
and the visible canvas is just the two alpha-blended each frame
(`crossfade.ts`'s `CrossFader`).

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
still animates, just without music-reactivity.

## Fullscreen

`fullscreen.ts` tries every vendor spelling of `requestFullscreen`, not just
the standard one. That is the whole point of the module: webOS/Tizen TV
browsers and older WebKit ship only `webkitRequestFullscreen`, and iPhone
Safari ships neither (just the video-only `webkitEnterFullscreen`) — an
implementation that calls the standard API and gives up is simply dead on a
TV, which is exactly how it shipped before. Both entry points are also
*toggles*: pressing while already fullscreen exits, because a TV remote has
no dependable Escape key.

`player/fullscreen` (`state/player.actions.ts`) fullscreens the whole
`.player-shell` when `ui.activeView === 'radio'` — not just
`.radio-now-playing`, since the control bar is a sibling of the visualizer
pane and fullscreening the pane alone left the viewer with no preset
picker, no pause, and no way back. Live still fullscreens the `<video>`
itself, which carries its own native controls. `player.css` spells the
fullscreen sizing out explicitly (`:fullscreen` plus a separate
`:-webkit-full-screen` rule — one unrecognised selector invalidates a whole
selector list) rather than trusting the UA stylesheet to reset the windowed
`max-height`, which TV browsers do not reliably do.
