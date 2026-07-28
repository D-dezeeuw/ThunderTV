import { refs } from 'spektrum';

/**
 * Fullscreen radio visualizer: canvas 2D, one preset — a rotating, zoom-
 * pulsing, hue-cycling radial spectrum, in the spirit of a 90s Winamp
 * Milkdrop preset — for "something to look at" while a radio station plays
 * on a TV. `startRadioVisualizer()`/`stopRadioVisualizer()` are called from
 * `src/player/bindings.ts` whenever `view.radio.active` and `player.active`
 * change; this module owns only the Web Audio graph and the render loop.
 *
 * CORS caveat: a `MediaElementAudioSourceNode` reads real frequency data
 * only when the element's audio is same-origin or CORS-clean.
 * mpegts.js/hls.js (the default engines, `src/player/engine.ts`) feed the
 * shared `<video>` via a `blob:` MediaSource URL, which counts as
 * same-origin, so the analyser sees real data for the common case. The
 * native-engine fallback assigns the raw cross-origin stream URL directly to
 * `video.src`; there the browser zeroes analyser output as a fingerprinting
 * guard, and the preset just idles (still animated, at rest) instead of
 * erroring.
 */

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceVideo: HTMLVideoElement | null = null;
let freqData: Uint8Array<ArrayBuffer> | null = null;
let rafId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let observedCanvas: HTMLCanvasElement | null = null;

let angle = 0;
let zoom = 1;
let lastTs: number | null = null;

const BAR_COUNT = 96;

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

function sizeCanvas(canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

function observeSize(canvas: HTMLCanvasElement): void {
    if (observedCanvas === canvas) return;
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => sizeCanvas(canvas));
    resizeObserver.observe(canvas);
    observedCanvas = canvas;
}

function average(data: Uint8Array<ArrayBuffer>, start: number, end: number): number {
    if (end <= start) return 0;
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] ?? 0;
    return sum / (end - start);
}

/**
 * One frame: bass drives the zoom pulse, mid drives rotation speed, treble
 * drives the center glow — coarse frequency bands rather than per-genre
 * tuning, but enough to read as "reacting to the music." A translucent fill
 * instead of a hard clear leaves a fading trail each frame, the cheapest
 * approximation of Milkdrop's feedback-buffer look canvas 2D can do.
 */
function render(ts: number, canvas: HTMLCanvasElement, node: AnalyserNode, data: Uint8Array<ArrayBuffer>): void {
    rafId = requestAnimationFrame((next) => render(next, canvas, node, data));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    node.getByteFrequencyData(data);

    const dt = lastTs === null ? 16 : Math.min(ts - lastTs, 64);
    lastTs = ts;

    const bassEnd = Math.floor(data.length * 0.12);
    const midEnd = Math.floor(data.length * 0.5);
    const bass = average(data, 0, bassEnd);
    const mid = average(data, bassEnd, midEnd);
    const treble = average(data, midEnd, data.length);

    const targetZoom = 1 + (bass / 255) * 0.35;
    zoom += (targetZoom - zoom) * 0.12;
    angle += (0.0006 + (mid / 255) * 0.0025) * dt;

    const { width, height } = canvas;
    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.min(width, height) * 0.16;
    const maxBarLength = Math.min(width, height) * 0.34;

    ctx.fillStyle = 'rgba(6, 8, 16, 0.22)';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(zoom, zoom);

    const hueBase = (ts / 40) % 360;
    for (let i = 0; i < BAR_COUNT; i++) {
        const bin = Math.floor((i / BAR_COUNT) * data.length);
        const value = data[bin] ?? 0;
        const pct = value / 255;
        const barLength = baseRadius * 0.1 + pct * maxBarLength;
        const theta = (i / BAR_COUNT) * Math.PI * 2;
        const hue = (hueBase + (i / BAR_COUNT) * 180) % 360;
        const lightness = 45 + pct * 25;

        ctx.strokeStyle = `hsl(${hue.toFixed(1)} 85% ${lightness.toFixed(1)}%)`;
        ctx.lineWidth = Math.max(1.5, (Math.min(width, height) / BAR_COUNT) * 0.9);
        ctx.beginPath();
        ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
        ctx.lineTo(Math.cos(theta) * (baseRadius + barLength), Math.sin(theta) * (baseRadius + barLength));
        ctx.stroke();
    }

    // A soft inner glow whose brightness tracks treble, so the center
    // doesn't read as a dead hole during quiet passages.
    ctx.beginPath();
    ctx.arc(0, 0, baseRadius * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hueBase.toFixed(1)}, 70%, ${(30 + (treble / 255) * 30).toFixed(1)}%, 0.35)`;
    ctx.fill();

    ctx.restore();
}

/** Starts (or resumes) the visualizer against `[data-ref="radioVisualizer"]`. A no-op if that canvas isn't mounted or the audio graph can't be created (e.g. an unsupported browser). */
export function startRadioVisualizer(video: HTMLVideoElement): void {
    const canvas = refs['radioVisualizer'];
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const node = ensureAudioGraph(video);
    if (!node || !freqData) return;

    stopRadioVisualizerLoop();
    sizeCanvas(canvas);
    observeSize(canvas);
    lastTs = null;
    const data = freqData;
    rafId = requestAnimationFrame((ts) => render(ts, canvas, node, data));
}

/** Stops the render loop only — the audio graph stays connected (sound keeps playing, and the source node can't be recreated) so a later `startRadioVisualizer()` just resumes drawing. */
export function stopRadioVisualizer(): void {
    stopRadioVisualizerLoop();
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
    angle = 0;
    zoom = 1;
    lastTs = null;
}
