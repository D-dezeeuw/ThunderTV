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
    /** Frequency-domain byte data straight from `AnalyserNode.getByteFrequencyData()` — length is the analyser's `frequencyBinCount`. */
    data: Uint8Array<ArrayBuffer>;
    /** 0-255 averages over the low/mid/high thirds of `data` — coarse bands, cheap to compute once and share across presets. */
    bass: number;
    mid: number;
    treble: number;
    /** True on the one frame a bass onset was detected (see `beat-detector.ts`). */
    beat: boolean;
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
