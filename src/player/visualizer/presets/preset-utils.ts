/** Linear interpolation into the normalized log-spaced bar array at `t` in [0, 1] — presets sample whatever ray/point count they need out of the shared FEATURE_BAR_COUNT bars. */
export function barAt(bars: Float32Array, t: number): number {
    const clamped = Math.min(1, Math.max(0, t));
    const pos = clamped * (bars.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(bars.length - 1, lo + 1);
    const frac = pos - lo;
    return (bars[lo] ?? 0) * (1 - frac) + (bars[hi] ?? 0) * frac;
}

/** Folded sampling for symmetric rings: `t` runs 0 → 1 → 0 across the circle, so the ring's left and right halves mirror instead of one half carrying the (quieter) top octaves. */
export function barAtMirrored(bars: Float32Array, t: number): number {
    const folded = t < 0.5 ? t * 2 : (1 - t) * 2;
    return barAt(bars, folded);
}

/** Frame-rate-independent exponential decay: multiply a stored impulse by this each frame. `perMs` is the per-millisecond survival factor (e.g. 0.994 ≈ half-life of ~115ms). */
export function decay(value: number, perMs: number, dt: number): number {
    return value * Math.pow(perMs, dt);
}
