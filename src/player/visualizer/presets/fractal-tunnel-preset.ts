import type { FrameContext, VisualizerPreset } from '../types';
import { barAtMirrored, decay } from './preset-utils';

/** Nested squares get closer to a genuine fractal look with every extra level, but each level costs a `strokeRect` — 6 is the point where it reads as "fractal" without being the frame's bottleneck. */
const CORE_DEPTH = 6;
/** Vertices of the spectrum-driven star injected around the core — carried outward by the feedback zoom into an endlessly refolding tunnel wall. */
const STAR_POINTS = 10;

/**
 * Endless zoom tunnel: each frame, the *previous* frame (held in an
 * offscreen history canvas) is redrawn zoomed-in and rotated slightly —
 * the classic "video feedback" trick — then fresh audio-reactive detail is
 * stamped at the center on top, to be carried outward by the next frames'
 * zoom. Three injections: a nested-squares fractal core, a star polygon
 * whose vertex radii follow the spectrum, and on every beat a bright ring
 * that the zoom turns into an expanding pulse racing down the tunnel.
 * History is drawn at slightly under full alpha so old generations fade
 * instead of accumulating into grey mush.
 */
export class FractalTunnelPreset implements VisualizerPreset {
    readonly id = 'fractal-tunnel';
    readonly label = 'Fractal Tunnel';

    private history: HTMLCanvasElement | null = null;
    private width = 0;
    private height = 0;
    private rotation = 0;
    private flash = 0;

    reset(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.history = document.createElement('canvas');
        this.history.width = width;
        this.history.height = height;
        this.rotation = 0;
        this.flash = 0;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bars, bass, mid, treble, beat, beatIntensity } = fc;
        if (!this.history || width !== this.width || height !== this.height)
            this.reset(width, height);
        const history = this.history;
        if (!history) return;

        if (beat) this.flash = Math.min(1, 0.5 + beatIntensity * 0.5);
        this.flash = decay(this.flash, 0.985, dt);

        const cx = width / 2;
        const cy = height / 2;
        // A per-ms growth rate, compounded via `Math.pow(rate, dt)` rather
        // than a flat per-frame multiplier, so the zoom speed doesn't swing
        // with the display's actual frame rate. Bass pushes the throttle.
        const zoomRatePerMs = Math.pow(2, 1 / 4200) + bass * 0.0003;
        const zoom = Math.pow(zoomRatePerMs, dt);
        this.rotation += (0.0002 + mid * 0.0008) * dt;

        ctx.save();
        ctx.fillStyle = '#04050b';
        ctx.fillRect(0, 0, width, height);
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);
        ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);
        // Slightly under full alpha: each generation dims a little as it
        // travels outward, so the tunnel stays deep and dark instead of
        // averaging into a flat grey blur.
        ctx.globalAlpha = 0.96;
        ctx.drawImage(history, 0, 0);
        ctx.restore();

        const hueBase = (ts / 28) % 360;
        const coreSize = Math.min(width, height) * 0.06;

        ctx.save();
        ctx.translate(cx, cy);

        // Spectrum star, counter-rotating against the tunnel spin so the
        // injected layers visibly shear apart as they travel outward.
        ctx.rotate(-this.rotation * 1.6);
        ctx.beginPath();
        for (let k = 0; k <= STAR_POINTS; k++) {
            const u = (k % STAR_POINTS) / STAR_POINTS;
            // Mirrored sampling: the star's radius runs bass → treble →
            // bass around the polygon, so the closing vertex meets its
            // neighbor at the same level instead of jumping from quiet
            // treble straight to loud bass — a jarring "wall" at the seam.
            const r = coreSize * (1.4 + barAtMirrored(bars, u) * 1.6);
            const theta = u * Math.PI * 2;
            const x = Math.cos(theta) * r;
            const y = Math.sin(theta) * r;
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${((hueBase + 120) % 360).toFixed(1)}, 90%, 62%, 0.85)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.rotate(this.rotation * 1.6);

        // Beat pulse: one bright ring, which the feedback zoom then carries
        // outward as an expanding wavefront — the classic tunnel thump.
        if (this.flash > 0.04) {
            ctx.strokeStyle = `hsla(${hueBase.toFixed(1)}, 95%, 72%, ${(this.flash * 0.85).toFixed(2)})`;
            ctx.lineWidth = 3 + this.flash * 4;
            ctx.beginPath();
            ctx.arc(0, 0, coreSize * 2.6, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();

        drawFractalCore(ctx, cx, cy, coreSize, hueBase, treble);

        // Ping-pong: this frame's fully composited output becomes next
        // frame's zoom source.
        const hctx = history.getContext('2d');
        hctx?.drawImage(ctx.canvas, 0, 0);
    }
}

function drawFractalCore(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    size: number,
    hueBase: number,
    treble: number,
): void {
    ctx.save();
    ctx.translate(cx, cy);
    let s = size;
    for (let i = 0; i < CORE_DEPTH; i++) {
        ctx.rotate(0.35 + treble * 0.4);
        ctx.strokeStyle = `hsla(${(hueBase + i * 30) % 360}, 90%, 65%, 0.9)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        s *= 0.68;
    }
    ctx.restore();
}
