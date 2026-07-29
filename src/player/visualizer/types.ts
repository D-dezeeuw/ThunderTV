/**
 * Shared shapes for the Radio visualizer's preset system (`../index.ts`
 * orchestrates; each `presets/*.ts` file owns exactly one preset's visuals).
 */

/** Everything a preset needs to draw one frame — computed once per frame by the orchestrator and handed to whichever preset is active. */
export interface FrameContext {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    /** `requestAnimationFrame`'s timestamp, ms. */
    ts: number;
    /** Elapsed time since the previous frame, ms, clamped so a tab-switch stall never causes a giant jump. */
    dt: number;
    /** Raw frequency bytes straight from the analyser — presets should almost always prefer `bars`, which is log-spaced and level-normalized (see `audio-features.ts`). */
    data: Uint8Array<ArrayBuffer>;
    /** Raw time-domain bytes (128 = silence midline) — the actual waveform, for oscilloscope-style presets. */
    wave: Uint8Array<ArrayBuffer>;
    /** FEATURE_BAR_COUNT log-spaced band levels in [0, 1], auto-gained so 1.0 means "loud for this station" regardless of stream volume. Sample fractionally via `presets/preset-utils.ts`'s `barAt()`. */
    bars: Float32Array;
    /** Auto-gained band levels in [0, 1] — kick/bassline, melody body, hats/air. */
    bass: number;
    mid: number;
    treble: number;
    /** Overall level in [0, 1] — the mean of the three bands. */
    energy: number;
    /** True on the one frame a bass onset was detected (see `beat-detector.ts`). */
    beat: boolean;
    /** 0..1 onset strength for the frame `beat` is true, else 0 — scale reactions by this. */
    beatIntensity: number;
}

/**
 * One visualizer preset. Presets own their own internal state (particle
 * arrays, offscreen buffers, accumulated angle/zoom) and their own
 * clear/trail strategy — the orchestrator never touches the canvas itself
 * between `reset()` and `frame()` calls.
 */
export interface VisualizerPreset {
    readonly id: string;
    readonly label: string;
    /** Called once when the preset becomes active, and again after the canvas resizes — (re)allocates anything sized to the canvas. */
    reset(width: number, height: number): void;
    /** Draws exactly one frame. */
    frame(fc: FrameContext): void;
}
