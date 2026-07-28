import type { FrameContext, VisualizerPreset } from '../types';
import { barAt, decay } from './preset-utils';

const SEGMENTS = 12;
const RAYS = 30;

/**
 * Classic kaleidoscope trick: draw this frame's audio-reactive "source art"
 * into a single wedge of an offscreen buffer (clipped to that wedge's pie
 * slice), then stamp rotated copies around the circle, mirroring every
 * other copy so the wedge boundaries line up seamlessly.
 *
 * The mirror transform is order-sensitive and was the original bug here:
 * `rotate(s·θ)` followed by `scale(1, -1)` maps the wedge [0, θ] onto
 * [s·θ − θ, s·θ] — exactly on top of the previous unmirrored segment, so
 * half the circle was double-painted and the other half stayed black. The
 * correct odd-segment transform is `rotate((s+1)·θ)` then `scale(1, -1)`,
 * which lands the mirrored wedge on [s·θ, (s+1)·θ] where it belongs.
 */
export class KaleidoscopePreset implements VisualizerPreset {
    readonly id = 'kaleidoscope';
    readonly label = 'Kaleidoscope';

    private buffer: HTMLCanvasElement | null = null;
    private width = 0;
    private height = 0;
    private drift = 0;
    private spin = 0;
    /** Angular-velocity impulse kicked on every beat, decaying — the whole mandala lurches into a faster turn on hits. */
    private spinVel = 0;
    private flash = 0;

    reset(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.buffer = document.createElement('canvas');
        this.buffer.width = width;
        this.buffer.height = height;
        this.drift = 0;
        this.spin = 0;
        this.spinVel = 0;
        this.flash = 0;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bars, bass, mid, treble, beat, beatIntensity } = fc;
        if (!this.buffer || width !== this.width || height !== this.height)
            this.reset(width, height);
        const buffer = this.buffer;
        if (!buffer) return;
        const bctx = buffer.getContext('2d');
        if (!bctx) return;

        this.drift += (0.0002 + mid * 0.0009) * dt;
        if (beat) {
            this.spinVel += 0.0016 * beatIntensity;
            this.flash = Math.min(1, 0.4 + beatIntensity * 0.6);
        }
        this.spin += this.spinVel * dt;
        this.spinVel = decay(this.spinVel, 0.996, dt);
        this.flash = decay(this.flash, 0.992, dt);

        const cx = width / 2;
        const cy = height / 2;
        const wedgeAngle = (Math.PI * 2) / SEGMENTS;
        const radius = Math.min(width, height) * 0.5;
        const hueBase = (ts / 35) % 360;

        bctx.clearRect(0, 0, width, height);
        bctx.save();
        bctx.translate(cx, cy);
        // Clip to one pie-slice wedge — everything drawn below only ever
        // lands inside it, so the un-clipped rest of the buffer stays
        // transparent for the mirrored copies to tile against.
        bctx.beginPath();
        bctx.moveTo(0, 0);
        bctx.arc(0, 0, radius, 0, wedgeAngle);
        bctx.closePath();
        bctx.clip();

        for (let i = 0; i < RAYS; i++) {
            const u = i / RAYS;
            const v = barAt(bars, u);
            const theta = u * wedgeAngle * 0.92 + 0.04 + Math.sin(this.drift * 2 + i) * 0.03;
            const len = radius * (0.12 + v * 0.8);
            const hue = (hueBase + u * 140) % 360;

            bctx.strokeStyle = `hsla(${hue.toFixed(1)}, 90%, 60%, 0.7)`;
            bctx.lineWidth = 1.5 + v * 3;
            bctx.beginPath();
            bctx.moveTo(Math.cos(theta) * radius * 0.06, Math.sin(theta) * radius * 0.06);
            bctx.lineTo(Math.cos(theta) * len, Math.sin(theta) * len);
            bctx.stroke();

            bctx.beginPath();
            bctx.fillStyle = `hsla(${hue.toFixed(1)}, 95%, 70%, ${(0.4 + v * 0.5).toFixed(2)})`;
            bctx.arc(Math.cos(theta) * len, Math.sin(theta) * len, 1.5 + v * 4, 0, Math.PI * 2);
            bctx.fill();
        }

        // Three arcs breathing with the bands — connective tissue between
        // the rays, so the pattern reads as lacework instead of spokes.
        const arcs: Array<[number, number]> = [
            [0.22 + bass * 0.18, bass],
            [0.45 + mid * 0.2, mid],
            [0.68 + treble * 0.22, treble],
        ];
        for (const [rPct, level] of arcs) {
            bctx.strokeStyle = `hsla(${((hueBase + rPct * 300) % 360).toFixed(1)}, 85%, 65%, ${(0.15 + level * 0.4).toFixed(2)})`;
            bctx.lineWidth = 1 + level * 2.5;
            bctx.beginPath();
            bctx.arc(0, 0, radius * rPct, 0.03, wedgeAngle - 0.03);
            bctx.stroke();
        }

        // Beat burst: a bright full-length ray bundle that every segment
        // then multiplies into a starburst.
        if (this.flash > 0.05) {
            bctx.strokeStyle = `hsla(${hueBase.toFixed(1)}, 95%, 78%, ${(this.flash * 0.7).toFixed(2)})`;
            bctx.lineWidth = 2 + this.flash * 3;
            bctx.beginPath();
            bctx.moveTo(0, 0);
            bctx.lineTo(Math.cos(wedgeAngle / 2) * radius, Math.sin(wedgeAngle / 2) * radius);
            bctx.stroke();
        }
        bctx.restore();

        ctx.fillStyle = 'rgba(4, 4, 10, 0.2)';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.drift * 0.4 + this.spin);
        ctx.globalCompositeOperation = 'lighter';
        for (let s = 0; s < SEGMENTS; s++) {
            ctx.save();
            if (s % 2 === 0) {
                ctx.rotate(s * wedgeAngle);
            } else {
                // Mirrored copy of [0, θ] lands on [s·θ, (s+1)·θ] — see the
                // class comment for why the rotation must be (s+1)·θ here.
                ctx.rotate((s + 1) * wedgeAngle);
                ctx.scale(1, -1);
            }
            ctx.drawImage(buffer, -cx, -cy);
            ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }
}
