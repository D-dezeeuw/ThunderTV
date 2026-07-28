import type { FrameContext, VisualizerPreset } from '../types';
import { barAtMirrored, decay } from './preset-utils';

const SPIKE_COUNT = 56;
/** Bounds the beat "camera shake" to a few pixels — violent, not nauseating. */
const MAX_SHAKE_PX = 7;
const MAX_BOLTS = 3;

interface Bolt {
    points: Array<[number, number]>;
    life: number;
    maxLife: number;
}

/**
 * Metal: aggressive, red, violent. Jagged fast-rotating red spikes on a
 * near-black field; every beat reverses the rotation direction (a hard
 * jolt) and kicks a bounded position shake, and strong beats strike
 * lightning bolts from the core to the edge. Treble (shredding) drives
 * both the spin rate and the jaggedness. A soft red bass wash pulses the
 * whole field — smooth, never a strobe.
 */
export class MetalPreset implements VisualizerPreset {
    readonly id = 'metal';
    readonly label = 'Metal';

    private angle = 0;
    private direction = 1;
    private shake = 0;
    private bolts: Bolt[] = [];

    reset(): void {
        this.angle = 0;
        this.direction = 1;
        this.shake = 0;
        this.bolts = [];
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bars, bass, treble, beat, beatIntensity } = fc;
        ctx.fillStyle = 'rgba(2, 0, 0, 0.38)';
        ctx.fillRect(0, 0, width, height);

        // Soft red wash riding the bass level — a smooth swell (alpha
        // capped low), deliberately not a beat-keyed flash.
        ctx.fillStyle = `hsla(0, 80%, 30%, ${(bass * 0.1).toFixed(2)})`;
        ctx.fillRect(0, 0, width, height);

        const maxRadius = Math.min(width, height) * 0.5;
        if (beat) {
            this.direction *= -1;
            this.shake = Math.min(1, 0.4 + beatIntensity * 0.6);
            if (beatIntensity > 0.55 && this.bolts.length < MAX_BOLTS) {
                this.bolts.push(makeBolt(maxRadius));
            }
        }
        this.shake = decay(this.shake, 0.985, dt);
        this.angle += (0.001 + treble * 0.005) * dt * this.direction;

        const cx = width / 2 + (Math.random() - 0.5) * this.shake * MAX_SHAKE_PX;
        const cy = height / 2 + (Math.random() - 0.5) * this.shake * MAX_SHAKE_PX;
        const baseRadius = Math.min(width, height) * 0.12;
        const maxLen = Math.min(width, height) * 0.38;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        for (let i = 0; i < SPIKE_COUNT; i++) {
            const v = barAtMirrored(bars, i / SPIKE_COUNT);
            const jaggedness = (Math.sin(ts * 0.02 + i) + 1) * 0.5;
            const theta = (i / SPIKE_COUNT) * Math.PI * 2;
            const len = maxLen * (v * 0.72 + jaggedness * 0.28 * treble);
            const lightness = 26 + v * 46;

            ctx.strokeStyle = `hsl(0 90% ${lightness.toFixed(1)}%)`;
            ctx.lineWidth = 2 + v * 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            ctx.lineTo(Math.cos(theta) * (baseRadius + len), Math.sin(theta) * (baseRadius + len));
            ctx.stroke();
        }
        ctx.restore();

        // Lightning bolts: short-lived jagged strikes from the core out.
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = this.bolts.length - 1; i >= 0; i--) {
            const bolt = this.bolts[i];
            if (!bolt) continue;
            bolt.life += dt;
            if (bolt.life >= bolt.maxLife) {
                this.bolts.splice(i, 1);
                continue;
            }
            const fade = 1 - bolt.life / bolt.maxLife;
            ctx.strokeStyle = `hsla(0, 30%, 88%, ${(fade * 0.75).toFixed(2)})`;
            ctx.lineWidth = 1.5 + fade * 2;
            ctx.beginPath();
            bolt.points.forEach(([x, y], k) => {
                if (k === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }
        ctx.restore();
    }
}

function makeBolt(maxRadius: number): Bolt {
    const heading = Math.random() * Math.PI * 2;
    const points: Array<[number, number]> = [];
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
        const r = (s / steps) * maxRadius;
        const wobble = s === 0 || s === steps ? 0 : (Math.random() - 0.5) * 0.5;
        points.push([Math.cos(heading + wobble) * r, Math.sin(heading + wobble) * r]);
    }
    return { points, life: 0, maxLife: 140 };
}
