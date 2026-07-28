import type { FrameContext, VisualizerPreset } from '../types';

/** Nested squares get closer to a genuine fractal look with every extra level, but each level costs a `strokeRect` — 6 is the point where it reads as "fractal" without being the frame's bottleneck. */
const CORE_DEPTH = 6;

/**
 * Endless zoom tunnel: each frame, the *previous* frame (held in an
 * offscreen history canvas) is redrawn zoomed-in and rotated slightly —
 * the classic "video feedback" trick — then a small nested-squares "fractal
 * core" is stamped at the center on top, so new detail is continuously
 * injected and then carried outward by the next frames' zoom. Bass speeds
 * up the zoom (a "thump" forward on a kick drum), mid drives rotation,
 * treble opens up the core's rotation for extra flicker.
 */
export class FractalTunnelPreset implements VisualizerPreset {
    readonly id = 'fractal-tunnel';
    readonly label = 'Fractal Tunnel';

    private history: HTMLCanvasElement | null = null;
    private width = 0;
    private height = 0;
    private rotation = 0;

    reset(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.history = document.createElement('canvas');
        this.history.width = width;
        this.history.height = height;
        this.rotation = 0;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bass, mid, treble } = fc;
        if (!this.history || width !== this.width || height !== this.height) this.reset(width, height);
        const history = this.history;
        if (!history) return;

        const cx = width / 2;
        const cy = height / 2;
        // A per-ms growth rate, compounded via `Math.pow(rate, dt)` rather
        // than a flat per-frame multiplier, so the zoom speed doesn't swing
        // with the display's actual frame rate.
        const zoomRatePerMs = Math.pow(2, 1 / 4000) + (bass / 255) * 0.0009;
        const zoom = Math.pow(zoomRatePerMs, dt);
        this.rotation += (0.00025 + (mid / 255) * 0.0009) * dt;

        ctx.save();
        ctx.fillStyle = '#04050b';
        ctx.fillRect(0, 0, width, height);
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);
        ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);
        ctx.drawImage(history, 0, 0);
        ctx.restore();

        const hueBase = (ts / 30) % 360;
        drawFractalCore(ctx, cx, cy, Math.min(width, height) * 0.05, hueBase, treble);

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
        ctx.rotate(0.35 + (treble / 255) * 0.4);
        ctx.strokeStyle = `hsla(${(hueBase + i * 30) % 360}, 90%, 65%, 0.9)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        s *= 0.68;
    }
    ctx.restore();
}
