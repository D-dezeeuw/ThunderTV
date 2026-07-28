import { refs } from 'spektrum';
import { BeatDetector } from './beat-detector';
import { createRadioVisualizerPresets } from './presets/index';
import { bandAverage } from './presets/preset-utils';
import type { FrameContext, VisualizerPreset } from './types';

/**
 * Fullscreen radio visualizer: canvas 2D, a small rotation of presets (see
 * `presets/index.ts`) driven by the shared `<video>` element's Web Audio
 * output — Radio's answer to "something to look at on a TV" while a station
 * plays. `bindings.ts` starts/stops it whenever `view.radio.active` and
 * `player.active` change; this module owns the Web Audio graph, canvas
 * sizing, beat detection, and preset cycling, and leaves each preset's own
 * visuals to its own file.
 *
 * CORS caveat: a `MediaElementAudioSourceNode` reads real frequency data
 * only when the element's audio is same-origin or CORS-clean.
 * mpegts.js/hls.js (the default engines, `src/player/engine.ts`) feed the
 * shared `<video>` via a `blob:` MediaSource URL, which counts as
 * same-origin, so the analyser sees real data for the common case. The
 * native-engine fallback assigns the raw cross-origin stream URL directly to
 * `video.src`; there the browser zeroes analyser output as a fingerprinting
 * guard, and every preset just idles (still animated, at rest) instead of
 * erroring.
 */

/** How long each preset plays before auto-advancing — long enough to actually look at, short enough that an unattended TV doesn't stall on one preset all evening. */
const AUTO_CYCLE_MS = 25_000;
/** Crossfade duration for every preset switch (auto-advance, "Next visual", or picking one from the dropdown) — long enough to read as a transition, short enough not to feel sluggish on demand. */
const TRANSITION_MS = 700;

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceVideo: HTMLVideoElement | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let observedCanvas: HTMLCanvasElement | null = null;
/** True while the listener has paused the visualizer — the render loop just isn't scheduled, so the last drawn frame stays on screen. */
let paused = false;

const beatDetector = new BeatDetector();
let presets: VisualizerPreset[] = createRadioVisualizerPresets();
let presetIndex = 0;
let presetElapsedMs = 0;
let activePresetCanvas: HTMLCanvasElement | null = null;
/** Non-null when the listener picked a specific preset (e.g. a genre) rather than "Auto" — see `setRadioVisualizerPreset()`. */
let pinnedPresetId: string | null = null;

/**
 * A crossfade in progress: the outgoing preset (`fromIndex`, left running —
 * never reset — so it keeps evolving normally while it fades out) and the
 * incoming one (`toIndex`, freshly reset) each render into their own
 * offscreen buffer every frame; the visible canvas is just the two buffers
 * alpha-blended by `elapsed / TRANSITION_MS`.
 */
interface Transition {
    fromIndex: number;
    toIndex: number;
    elapsed: number;
}
let transition: Transition | null = null;
let bufferA: HTMLCanvasElement | null = null;
let bufferB: HTMLCanvasElement | null = null;

let lastTs: number | null = null;

/**
 * (Re)creates the Web Audio graph against `video`, reusing it across
 * start/stop cycles. `createMediaElementSource()` may only ever be called
 * once per media element, so this is a no-op past the first call for a
 * given `<video>` node — which is the shared, long-lived player element
 * (`src/player/engine.ts`'s sole attach point), never recreated per channel.
 */
function ensureAudioGraph(video: HTMLVideoElement): AnalyserNode | null {
    if (sourceVideo === video && audioCtx && analyser) {
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        return analyser;
    }
    try {
        const ctx = audioCtx ?? new AudioContext();
        audioCtx = ctx;
        const node = ctx.createMediaElementSource(video);
        const analyserNode = ctx.createAnalyser();
        analyserNode.fftSize = 1024;
        analyserNode.smoothingTimeConstant = 0.82;
        node.connect(analyserNode);
        // A MediaElementAudioSourceNode routes the element's audio
        // exclusively through the graph it's connected to (spec behavior) —
        // without this the station goes silent the moment the visualizer
        // starts.
        analyserNode.connect(ctx.destination);
        analyser = analyserNode;
        sourceVideo = video;
        freqData = new Uint8Array(new ArrayBuffer(analyserNode.frequencyBinCount));
        if (ctx.state === 'suspended') void ctx.resume();
        return analyserNode;
    } catch (err) {
        console.error('[ThunderTV] radio visualizer: audio graph unavailable:', err);
        return null;
    }
}

function sizeCanvas(canvas: HTMLCanvasElement): boolean {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === width && canvas.height === height) return false;
    canvas.width = width;
    canvas.height = height;
    return true;
}

function observeSize(canvas: HTMLCanvasElement): void {
    if (observedCanvas === canvas) return;
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => {
        // A resized canvas invalidates any preset's offscreen buffers
        // (particle bounds, the kaleidoscope wedge, the fractal tunnel's
        // history frame) — every preset's `reset()` re-derives from the new
        // dimensions, not just the one currently active. A resize mid-
        // crossfade would need the transition's own buffers re-sized too;
        // simplest and unnoticeable is to just land on the incoming preset.
        if (sizeCanvas(canvas)) {
            if (transition) {
                presetIndex = transition.toIndex;
                transition = null;
            }
            presets[presetIndex]?.reset(canvas.width, canvas.height);
        }
    });
    resizeObserver.observe(canvas);
    observedCanvas = canvas;
}

function ensureTransitionBuffers(width: number, height: number): void {
    if (!bufferA || bufferA.width !== width || bufferA.height !== height) {
        bufferA = document.createElement('canvas');
        bufferA.width = width;
        bufferA.height = height;
    }
    if (!bufferB || bufferB.width !== width || bufferB.height !== height) {
        bufferB = document.createElement('canvas');
        bufferB.width = width;
        bufferB.height = height;
    }
}

function render(
    ts: number,
    canvas: HTMLCanvasElement,
    node: AnalyserNode,
    data: Uint8Array<ArrayBuffer>,
): void {
    rafId = requestAnimationFrame((next) => render(next, canvas, node, data));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    node.getByteFrequencyData(data);

    const dt = lastTs === null ? 16 : Math.min(ts - lastTs, 64);
    lastTs = ts;

    presetElapsedMs += dt;
    // A pinned preset (the listener picked a genre explicitly) never
    // auto-advances away — only "Auto" in the picker keeps the rotation
    // going. Never starts a second transition on top of one already playing.
    if (!transition && !pinnedPresetId && presetElapsedMs >= AUTO_CYCLE_MS) {
        beginTransition(canvas, (presetIndex + 1) % presets.length);
    }

    const bass = bandAverage(data, 0, 0.12);
    const mid = bandAverage(data, 0.12, 0.5);
    const treble = bandAverage(data, 0.5, 1);
    const beat = beatDetector.update(bass, dt);
    const shared = { width: canvas.width, height: canvas.height, ts, dt, data, bass, mid, treble, beat };

    if (transition) {
        renderTransition(ctx, canvas, transition, shared);
        return;
    }
    presets[presetIndex]?.frame({ ...shared, ctx });
}

function renderTransition(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    active: Transition,
    shared: Omit<FrameContext, 'ctx'>,
): void {
    ensureTransitionBuffers(canvas.width, canvas.height);
    const actxA = bufferA?.getContext('2d');
    const actxB = bufferB?.getContext('2d');
    if (!actxA || !actxB) {
        transition = null;
        return;
    }
    presets[active.fromIndex]?.frame({ ...shared, ctx: actxA });
    presets[active.toIndex]?.frame({ ...shared, ctx: actxB });

    active.elapsed += shared.dt;
    const t = Math.min(1, active.elapsed / TRANSITION_MS);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.drawImage(bufferA as HTMLCanvasElement, 0, 0);
    ctx.globalAlpha = t;
    ctx.drawImage(bufferB as HTMLCanvasElement, 0, 0);
    ctx.globalAlpha = 1;

    if (t >= 1) transition = null;
}

/** Starts a crossfade to `toIndex`, leaving the outgoing preset running (untouched) so it keeps animating while it fades out; the incoming preset is reset immediately so it starts clean. A no-op if already there or mid-transition to it. */
function beginTransition(canvas: HTMLCanvasElement, toIndex: number): void {
    if (toIndex === presetIndex || (transition && transition.toIndex === toIndex)) return;
    presets[toIndex]?.reset(canvas.width, canvas.height);
    transition = { fromIndex: presetIndex, toIndex, elapsed: 0 };
    presetIndex = toIndex;
    presetElapsedMs = 0;
    beatDetector.reset();
}

/**
 * Manual "next preset" — the `player/nextVisualizerPreset` action's entry
 * point. Always advances past a pin (browsing forward is an explicit
 * override of "stay on this genre"); `player.actions.ts` also resets the
 * `player.visualizerPreset` setting to `'auto'` in the same click so the
 * picker's displayed value doesn't drift from what's actually on screen.
 * A no-op while the visualizer isn't running.
 */
export function cycleRadioVisualizerPreset(): void {
    if (!activePresetCanvas) return;
    pinnedPresetId = null;
    beginTransition(activePresetCanvas, (presetIndex + 1) % presets.length);
}

/**
 * Applies the listener's preset preference (`player.visualizerPreset`,
 * `'auto'` or a preset id). `'auto'` just clears the pin and lets the
 * existing rotation continue; a specific id pins to that preset and
 * crossfades to it immediately — switching now, not waiting for the current
 * preset's turn to end.
 */
export function setRadioVisualizerPreset(preference: string): void {
    if (preference === 'auto') {
        pinnedPresetId = null;
        return;
    }
    const index = presets.findIndex((p) => p.id === preference);
    if (index === -1) return;
    pinnedPresetId = preference;
    if (activePresetCanvas) {
        beginTransition(activePresetCanvas, index);
        return;
    }
    // Not running yet (e.g. picked while parked on another view) — just
    // land on it directly next time `startRadioVisualizer()` runs.
    presetIndex = index;
    presetElapsedMs = 0;
    beatDetector.reset();
}

/** Pauses or resumes the render loop — freezing the last drawn frame in place rather than blanking the canvas. `startRadioVisualizer()` respects a pause already in effect (e.g. set before Radio became active) and stays frozen until resumed. */
export function setRadioVisualizerPaused(value: boolean): void {
    paused = value;
    if (paused) {
        stopRadioVisualizerLoop();
        return;
    }
    if (!activePresetCanvas || !analyser || !freqData || rafId !== null) return;
    lastTs = null;
    const canvas = activePresetCanvas;
    const node = analyser;
    const data = freqData;
    rafId = requestAnimationFrame((ts) => render(ts, canvas, node, data));
}

/**
 * Starts (or resumes) the visualizer against `[data-ref="radioVisualizer"]`.
 * A no-op if that canvas isn't mounted or the audio graph can't be created
 * (e.g. an unsupported browser). Also a no-op — deliberately — if the
 * visualizer is already running against this exact canvas: `bindings.ts`
 * calls this on every change to any of several dependencies (view, preset
 * preference, pause), not only on a genuine activation, and a full reset
 * here would stomp an in-flight preset crossfade or pause state on every
 * one of those. Preset/pause changes apply through their own setters.
 */
export function startRadioVisualizer(video: HTMLVideoElement): void {
    const canvas = refs['radioVisualizer'];
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (activePresetCanvas === canvas && sourceVideo === video) return;
    const node = ensureAudioGraph(video);
    if (!node || !freqData) return;

    stopRadioVisualizerLoop();
    sizeCanvas(canvas);
    observeSize(canvas);
    activePresetCanvas = canvas;
    transition = null;
    lastTs = null;
    presetElapsedMs = 0;
    beatDetector.reset();
    presets[presetIndex]?.reset(canvas.width, canvas.height);
    if (paused) return;
    const data = freqData;
    rafId = requestAnimationFrame((ts) => render(ts, canvas, node, data));
}

/** Stops the render loop only — the audio graph stays connected (sound keeps playing, and the source node can't be recreated) so a later `startRadioVisualizer()` just resumes drawing, on whichever preset was active. Also drops any pause/transition in progress — leaving Radio and coming back starts clean rather than silently still-paused. */
export function stopRadioVisualizer(): void {
    stopRadioVisualizerLoop();
    activePresetCanvas = null;
    transition = null;
    paused = false;
}

function stopRadioVisualizerLoop(): void {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}

/** Test-only reset — mirrors `resetPlayerEngineForTests()`'s convention. @internal */
export function resetRadioVisualizerForTests(): void {
    stopRadioVisualizerLoop();
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedCanvas = null;
    audioCtx = null;
    analyser = null;
    sourceVideo = null;
    freqData = null;
    activePresetCanvas = null;
    paused = false;
    transition = null;
    bufferA = null;
    bufferB = null;
    presets = createRadioVisualizerPresets();
    presetIndex = 0;
    presetElapsedMs = 0;
    pinnedPresetId = null;
    beatDetector.reset();
    lastTs = null;
}
