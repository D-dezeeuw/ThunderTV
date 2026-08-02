# src/player/

The engine-agnostic player host, the `PlayerEngine` interface, and the
lazy-loaded hls.js/mpegts.js/native engines.

Owners: Phase 10 — Playback Foundation; Phase 11 — HLS & MPEG-TS Engines;
Phase 12 — Player UI: Dock & Theater.

`engine.ts` sits on ESLint's 400-line ceiling, so two halves of it live
next door: `engine-select.ts` (which engine gets this URL, in which form)
and `engine-report.ts` (turning a failure into a sentence). Both are free
of module state and are where a change to either question belongs.

## Picking an engine (and why a movie must never reach a demuxer)

`attemptChain()` in `engine-select.ts` orders the three engines:
`settings.playbackEngine` first (default `mpegts`), the rest behind it as
fallbacks — **except** when `isProgressiveFile()` matches the URL, where
the chain is `['native']` and nothing else.

That exception is the whole of Feature 21.4.4, and it is not an
optimization. Xtream VOD is `movie/user/pass/1234.mkv` — a file with a
`Content-Length`, not a feed. Neither demuxer can read one, and letting
them try costs real bandwidth before they find that out: mpegts.js buffers
a whole stash (`stashInitialSize`, up to 4 MB) before its format probe can
fail, and hls.js's playlist loader reads the *entire* response body as text
hunting for `#EXTM3U`. Pointed at a feature-length film that is a
multi-hundred-megabyte download that ends in a timeout, with the browser's
buffering spinner up the whole time — which is exactly what "movies load
forever and seem to download in the background" was.

Native is also the only engine that streams these *incrementally*: a plain
`video.src` fetches ahead of the playhead and seeks with `Range` requests,
which the proxy forwards (`scripts/cloudflare-cors-proxy.mjs`) and Xtream
panels honour. Container support is the browser's, not ours — MP4/H.264
plays everywhere, Matroska is not something Chromium advertises at all, and
`describeMediaError()` says so by name rather than leaving a bare
`MEDIA_ERR_SRC_NOT_SUPPORTED`.

Live vs. VOD is stated, never inferred: `bindings.ts` reads
`player.active.kind` and passes `attachAndPlay(…, { live })`, which reaches
`attachMpegts()` as `isLive`. A movie whose `container_extension` is `ts`
still goes through mpegts.js, and telling it the truth is what keeps the
transfer seekable, rewindable, and un-restarted by the adaptive-buffer
escalation.

The last attempt in a chain — and only the last, since every earlier one
has a fallback behind it — gets a 20-second deadline. A `<video>` pointed
at a URL that yields nothing decodable emits neither `error` nor frames, so
without it the spinner is the only feedback that ever exists. Expiry
reports through the normal path (probe included) and tears nothing down, so
a stream that is merely slow clears the message itself once it starts.

## Switching streams (one attach at a time)

`engine.ts` keeps an `attachToken`, bumped by every `attachAndPlay()` and
every `detach()`. It exists because attaching is asynchronous —
`import('mpegts.js')`, `import('hls.js')`, `video.play()` — while the engine
handle, the chain cursor, the `playing` flag and the `<video>` element are
all module-global and shared. Pressing a second channel while the first was
still attaching therefore left *both* attempts live: the superseded one
resumed after its import, called `detachMpegts()` (destroying the player
that had just replaced it), attached its own, and advanced the new stream's
engine chain past its end. On screen that was the old channel still playing,
the new one dead, and a spurious "Playback failed"; underneath it was two
MediaSources on one element, which is what Chromium's
`SharedImageManager::ProduceOverlay ... non-existent mailbox` / `Invalid
mailbox` GPU errors are complaining about.

So: every async continuation and every engine callback (hls.js `ERROR` and
`MANIFEST_PARSED`, mpegts' `onFatalError`, the element's `error` handler,
`advanceChain()`, the `describeStream()` probe) carries the token its attach
started with and returns early once it is stale. `attachMpegts()` takes an
`isStale` option for the same reason, checked immediately after its dynamic
import so a superseded attempt cannot tear down the current player.

`detach()` is the full stop, and every attach begins with one: engines,
health monitor, chain state, *and* the element — `pause()`, clear
`srcObject`, drop `src`, `load()`. Clearing the MediaSource matters as much
as destroying the engine; destroying the engine does not reliably take it
with it, and a stale one keeps a decoder and its GPU surfaces alive for a
stream nobody is watching.

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
correct-and-expected snapshot. mpegts.js has no track API of its own, so it
gets the same element-level engine (`attachElementTracks()`): it adds
nothing to `video.textTracks`, but a subtitle file the viewer loaded is a
real `<track>` on that element and belongs in the menu whatever is feeding
it. `track-prefs.ts` is the pure preference resolver (`normalizeLangCode`,
`pickDefaultAudioTrack`, `pickDefaultSubtitleTrack`), engine/Spektrum-free
by design.

### Subtitles the viewer brings (`external-subs.ts`, `subtitle-text.ts`)

A movie's own subtitles are, in practice, unreachable: Xtream VOD is a
progressive file played natively, its subtitle streams live inside the
container (MKV's SRT/PGS, an `.mp4`'s tx3g), and no browser exposes those to
`video.textTracks` — Chromium does not even demux them. So for the whole
Movies/TV Shows catalog the subtitle menu was correctly, permanently empty,
which reads as a broken feature rather than an absent one. The menu's
"Load subtitle file…" row (`player/loadSubtitleFile`, `player-tracks.
actions.ts`) is the route that always works: pick a `.srt`/`.vtt` through
`getPlatform().files`, `toVtt()` it (SubRip differs by a header and a
decimal comma), and attach it as a `<track>` with a blob URL. From there
nothing is special-cased — the browser renders and positions it, the
element lists it, `native-tracks.ts` maps it like any other track, and the
menu's existing "Off" row turns it off. `clearExternalSubtitles()` runs in
the engine's `stopVideoElement()`, so a file loaded for one film never
follows the viewer into the next one with silently wrong timings.

### No decodable audio (`audio-output.ts`)

A browser that meets an audio codec it has no decoder for does not fail the
load: it plays the video track, drops the audio one, and leaves
`video.error` null. AC-3/E-AC-3/DTS are all over movie files (and a fair few
`.ts` channels), Chromium's ffmpeg decodes none of them, and mpegts.js only
demuxes AAC/MP3 regardless — so "perfect picture, no sound, no reason
given" was the single most confusing thing playback could do. The element's
own decoder counters answer it for every engine at once: three samples over
the first half-minute, and video climbing while `webkitAudioDecodedByteCount`
stays at zero (or Firefox's `mozHasAudio === false`) publishes
`player.playbackNotice`. Anything less positive stays `'unknown'` and says
nothing — a false "no sound" over a stream that has sound is worse than
silence about it.

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
the picker (`index.html`'s `radio-visualizer-btn` menu, `player.visualizerPreset`
in `state/player.ts`, persisted), in which case only picking `'auto'` again
resumes the rotation. That preference **defaults to `'classical'`**, so out of
the box a pin is already in effect: Radio opens on one settled look rather than
rotating through ten, and the rotation is opt-in via the picker's first row.
(Persisted, so an install that already chose something keeps it.)
`player/nextVisualizerPreset` (`state/player.actions.ts`)
skips manually and always clears a pin. Every switch — auto-advance, the
picker, or "Next visual" — crossfades rather than cutting instantly: the
outgoing preset keeps rendering into one offscreen buffer (seeded from the
frame on screen, so trail-based looks carry into the fade instead of
dipping to black), the incoming one (freshly reset) renders into another,
and the visible canvas is just the two alpha-blended each frame
(`crossfade.ts`'s `CrossFader`).

### Trails, and why they used to fade to grey

Most presets fade rather than clear: a translucent full-canvas fill each
frame leaves the afterimage that reads as a trail. Every one of them used a
*tinted* fill (`rgba(6, 8, 16, .22)` and friends), and that is the whole
problem — a repeated alpha blend converges on the colour it paints, so the
floor of each preset was that tint by construction, never black. Two more
things pushed the same way: canvas compositing is 8-bit and rounds, so even a
pure black fade is `round(v · (1 − α))`, which has a fixed point wherever
`v · α < 0.5` (α = 0.05 stalls at a permanent #0a0a0a); and the canvas never
reached full alpha, letting `.radio-now-playing`'s CSS background bleed
through the shortfall — `--color-bg`, which is *white* in the light theme.

`presets/preset-utils.ts`'s `fadeTrails()` is the single fade every preset now
calls, and it is three passes: the fade in pure black, a `destination-over`
opaque black backing the frame with real black instead of the pane behind it,
and a `color-burn` floor against `rgb(254, 254, 254)` that subtracts about one
8-bit unit from the shadows and nothing from the highlights — `Cb ≤ 1/255`
hits the `min()` clamp and lands on exactly 0, so the residue counts down a
unit a frame and *stops* at #000 with the bright end of the trail untouched.
The burn is feature-detected, since assigning an unsupported operation is a
no-op and painting near-white through `source-over` would blow out the frame.
Fractal Tunnel fades by redrawing a dimmed copy of the previous frame instead
of by filling, so it calls the floor pass alone (`floorToBlack()`), right
after the history composite and before this frame's fresh detail goes on.

`player/toggleVisualizerPause` (`player.visualizerPaused`, transient —
always false on a fresh Radio visit) freezes the render loop entirely rather
than blanking the canvas, so the last drawn frame just sits there until
resumed.

### Audio-only TV (`player.audioMode`)

The visualizer is not Radio's alone: `player/toggleAudioMode`
(`state/player.actions.ts`, a button in the player bar shown in Categories —
and in Live *only while the mode is already on*, so a persisted preference
always keeps a visible way back to the picture; it was distracting there
otherwise) plays a *television* channel with the picture collapsed and the
visualizer in its place — a TV used as a stereo. One pure predicate,
`state/player.ts`'s `isAudioVisual(view, audioMode)`, decides this
everywhere: the `visualizerActive` computed the markup binds to
(`player.selectors.ts`), `player/fullscreen`'s "fullscreen the pane, not the
video" branch, and `bindings.ts`'s visualizer watch. It is true for Radio
regardless of the flag, and for `live`/`categories` only when the flag is
on — never for a view that doesn't mount the canvas. The preference is
persisted; `player.css`'s modifier is `.player-shell--audio` (renamed from
`--radio`, which no longer described what it means).

`bindings.ts` starts/stops the whole thing and applies the preset/pause
preference whenever the active view, `player.active`,
`player.visualizerPreset`, `player.visualizerPaused`, or `player.audioMode`
change, in a
`watch()` kept separate from the attach/detach one so none of those ever
restarts the stream. `startRadioVisualizer()` is itself a no-op when already
running against the same canvas — the same `watch()` fires on every one of
those four dependencies, and a full reset on each call would stomp an
in-flight crossfade or the pause state; preset/pause changes apply through
their own setters instead.

### Where the audio comes from (`visualizer/audio-tap.ts`)

**Listening must never change what comes out of the speakers**, and that is
the whole reason this module exists. The original graph used
`createMediaElementSource(video)`, which *re-routes* the element's audio into
the graph — and per spec outputs **silence** whenever the element's current
resource is CORS-cross-origin. One call marks that `<video>` for the life of
the page, and the shared element is never recreated. So: play one Radio
station or one audio-only TV channel (both `blob:` MediaSource, both
audible), then open a movie — a progressive file the native engine hands
straight to `video.src`, cross-origin — and it plays picture-perfect and dead
silent. That was "movies have no sound".

`captureStream()` (`mozCaptureStream()` on Firefox) is the same data without
the hijack: a *copy* of what the element plays, leaving the element's own
output alone. Nothing here connects to `ctx.destination` for that reason — an
`AnalyserNode` with no downstream connection still runs (the spec's
automatic-pull list), so the analyser reads real data from a graph that is
audibly inert. Every route that cannot produce data — Safari (no
`captureStream()`), a tainted resource (Chromium throws), a capture taken
before the stream had an audio track — returns `SILENT_TAP` (zeroed spectrum,
128-centred waveform) rather than `null`, so the presets animate at rest and
the viewer keeps their sound. The tap is keyed on the element *and* its
current stream, so a new channel/movie on the same element re-taps.

## Fullscreen

`fullscreen.ts` tries every vendor spelling of `requestFullscreen`, not just
the standard one. That is the whole point of the module: webOS/Tizen TV
browsers and older WebKit ship only `webkitRequestFullscreen`, and iPhone
Safari ships neither (just the video-only `webkitEnterFullscreen`) — an
implementation that calls the standard API and gives up is simply dead on a
TV, which is exactly how it shipped before. Both entry points are also
*toggles*: pressing while already fullscreen exits, because a TV remote has
no dependable Escape key.

`player/fullscreen` (`state/player.actions.ts`, the exported
`togglePlayerFullscreen()`) fullscreens the whole `.player-shell` whenever
`isAudioVisual()` holds (Radio, or a TV channel in audio mode) — not just
`.radio-now-playing`, since the control bar is a sibling of the visualizer
pane and fullscreening the pane alone left the viewer with no preset
picker, no pause, and no way back. Everything showing a real picture —
Live, Categories, Movies, TV Shows — plays into the same `<video>` and
fullscreens that, since it carries its own native controls. `player.css`
spells the fullscreen sizing out explicitly (`:fullscreen` plus a separate
`:-webkit-full-screen` rule — one unrecognised selector invalidates a whole
selector list) rather than trusting the UA stylesheet to reset the windowed
`max-height`, which TV browsers do not reliably do.

Page-level fullscreen is not always granted, so where the host owns a
window of its own — the Electron shell, via `getPlatform().windowFullscreen`
(`core/platform/README.md`) — `togglePlayerFullscreen()` checks a beat later
whether anything actually went fullscreen and, if not, fullscreens the
*window* instead. That is a real answer to "make this big," not a
consolation prize, and the same button toggles back out of it. Everything up
to the `requestFullscreen()` call stays synchronous on purpose: it runs
inside the click handler, and an `await` above it would spend the click's
transient user activation, which is the one thing browsers require here.

## Resume position (`position.ts`, Phase 38)

Sits on the `<video>` element alongside `stream-health.ts`, and for the same
reason: it is the one place hls.js, mpegts.js and native all converge, so no
engine has to know about it. `attachAndPlay()` calls
`trackPlaybackPosition()` once and everything else follows from that —
sampling `timeupdate` (throttled to a write every five seconds, flushed on
stop), and seeking to whatever is stored once the element knows its
duration.

Three deliberate refusals, each of which is the honest answer rather than the
convenient one:

- **Live is never tracked.** A live `currentTime` is an offset into whatever
  the buffer holds, not a place in a programme, so the same stored number
  would mean something different every time it was read.
- **A finished programme is forgotten**, on `ended` and within twenty
  seconds of the end. Resuming someone into the closing credits is worse
  than starting them over.
- **The first fifteen seconds are not stored.** Below that, resuming is
  only a surprise.

The store is keyed on `src/health/stream-key.ts`'s masked fingerprint, so a
position survives a password rotation — and so an arriving handoff
(`src/handoff/README.md`) can write into the very same store rather than
needing a second resume path through the engine.
