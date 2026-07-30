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

/**
 * The `color-burn` source for the floor pass: exactly one 8-bit unit shy of
 * white. `1 − min(1, (1 − Cb) / Cs)` with `Cs = 254/255` subtracts about one
 * unit from the shadows and essentially nothing from the highlights — and
 * any `Cb ≤ 1/255` hits the `min()` clamp and lands on exactly 0.
 */
const BLACK_FLOOR_SOURCE = 'rgb(254, 254, 254)';

/**
 * The trail fade every trail-based preset uses — and, unlike the translucent
 * fills it replaces, one that actually lands on #000.
 *
 * Three things kept the old fade off black, all of them reading as the same
 * grey haze under the trails:
 *
 * 1. **The fill was tinted**, not black (`rgba(6, 8, 16, .22)` and friends).
 *    A repeated alpha blend converges on whatever colour it paints, so the
 *    floor of every trail preset *was* that tint, by construction.
 * 2. **Canvas compositing is 8-bit and rounds.** Even a pure black fade is
 *    `round(v · (1 − α))`, which has a fixed point wherever `v · α < 0.5` —
 *    so α = 0.22 stalls at v ≈ 2, and the long-trail presets at α = 0.05
 *    stall at v ≈ 10, i.e. a permanent #0a0a0a.
 * 3. **The canvas never reached full alpha**, so `.radio-now-playing`'s CSS
 *    background bled through the shortfall — `--color-bg`, which is *white*
 *    in the light theme.
 *
 * So the fade is three passes: the fade itself in pure black (nothing to
 * converge on but black); `destination-over` opaque black, which backs the
 * frame with real black rather than the pane behind it; and a `color-burn`
 * floor that walks the last few units of residue down to exactly 0 and stops
 * there, leaving the bright end of the trail alone.
 */
export function fadeTrails(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    alpha: number,
): void {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    floorToBlack(ctx, width, height);
}

/**
 * The floor pass on its own, for a preset whose fade isn't a translucent fill
 * (`fractal-tunnel-preset.ts` re-draws a dimmed copy of the previous frame
 * instead, and rounds off the same way).
 *
 * The `destination-over` pass is not only cosmetic: a blend mode over a
 * partly transparent destination composites the source *in* proportionally,
 * and for a near-white source that is exactly the wash being removed. Making
 * the frame opaque first is what makes the burn safe. The burn itself is
 * feature-detected — assigning an unsupported operation is a no-op, and
 * painting near-white with `source-over` would blow out the frame.
 */
export function floorToBlack(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'color-burn';
    if (ctx.globalCompositeOperation === 'color-burn') {
        ctx.fillStyle = BLACK_FLOOR_SOURCE;
        ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
}
