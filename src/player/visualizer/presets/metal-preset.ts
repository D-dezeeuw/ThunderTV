import type { FrameContext, VisualizerPreset } from '../types';

const SPIKE_COUNT = 56;
/** Bounds the beat "camera shake" to a few pixels — violent, not nauseating. */
const MAX_SHAKE_PX = 6;

/**
 * Metal: aggressive, red, violent. Jagged, fast-rotating red spikes on a
 * near-black field; every detected beat reverses the rotation direction
 * (a hard jolt) and kicks a small, bounded position jitter — "violent"
 * without a full-screen strobe.
 */
export class MetalPreset implements VisualizerPreset {
    readonly id = 'metal';
    readonly label = 'Metal';

    private angle = 0;
    private shake = 0;

    reset(): void {
        this.angle = 0;
        this.shake = 0;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, data, bass, treble, beat } = fc;
        ctx.fillStyle = 'rgba(2, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, height);

        this.angle += (0.0012 + (treble / 255) * 0.006) * dt * (beat ? -1 : 1);
        this.shake += ((beat ? 1 : 0) - this.shake) * (beat ? 1 : 0.2);

        const cx = width / 2 + (Math.random() - 0.5) * this.shake * MAX_SHAKE_PX;
        const cy = height / 2 + (Math.random() - 0.5) * this.shake * MAX_SHAKE_PX;
        const baseRadius = Math.min(width, height) * 0.12;
        const maxLen = Math.min(width, height) * 0.4;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        for (let i = 0; i < SPIKE_COUNT; i++) {
            const bin = Math.floor((i / SPIKE_COUNT) * data.length);
            const pct = (data[bin] ?? 0) / 255;
            const jaggedness = (Math.sin(ts * 0.02 + i) + 1) * 0.5;
            const theta = (i / SPIKE_COUNT) * Math.PI * 2;
            const len = maxLen * (pct * 0.7 + jaggedness * 0.3 * (bass / 255));
            const lightness = 28 + pct * 45;

            ctx.strokeStyle = `hsl(0 90% ${lightness.toFixed(1)}%)`;
            ctx.lineWidth = 2 + pct * 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            ctx.lineTo(Math.cos(theta) * (baseRadius + len), Math.sin(theta) * (baseRadius + len));
            ctx.stroke();
        }
        ctx.restore();
    }
}
