import type { FrameContext, VisualizerPreset } from '../types';

const SPIKE_COUNT = 40;

/**
 * Rock: tough and driving, still melodic. Angular spikes with a fast-attack,
 * slow-decay envelope (a punchy snap outward on the beat, an easing settle
 * back rather than tracking the raw bin value 1:1), a dull silver highlight
 * along each spike for a metallic edge, and an ember red-orange palette.
 */
export class RockPreset implements VisualizerPreset {
    readonly id = 'rock';
    readonly label = 'Rock';

    private angle = 0;
    private envelope: number[] = [];

    reset(): void {
        this.angle = 0;
        this.envelope = new Array(SPIKE_COUNT).fill(0) as number[];
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, dt, data, bass, beat } = fc;
        if (this.envelope.length === 0) this.reset();

        ctx.fillStyle = 'rgba(8, 6, 6, 0.24)';
        ctx.fillRect(0, 0, width, height);

        this.angle += (0.0003 + (bass / 255) * 0.0009) * dt;

        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * 0.15;
        const maxLen = Math.min(width, height) * 0.32;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        for (let i = 0; i < SPIKE_COUNT; i++) {
            const bin = Math.floor((i / SPIKE_COUNT) * data.length);
            const pct = (data[bin] ?? 0) / 255;
            const current = this.envelope[i] ?? 0;
            this.envelope[i] = pct > current ? pct : Math.max(0, current - dt * 0.0007);
            const value = this.envelope[i] ?? 0;

            const theta = (i / SPIKE_COUNT) * Math.PI * 2;
            const len = maxLen * value * (beat ? 1.15 : 1);
            const hue = 12 + value * 20;
            const tipX = Math.cos(theta) * (baseRadius + len);
            const tipY = Math.sin(theta) * (baseRadius + len);

            ctx.strokeStyle = `hsl(${hue.toFixed(1)} 70% ${(40 + value * 30).toFixed(1)}%)`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();

            // A dull silver highlight along each spike's outer half — a
            // metallic sheen instead of a flat single-color bar.
            ctx.strokeStyle = 'hsla(0, 0%, 78%, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(
                Math.cos(theta) * (baseRadius + len * 0.5),
                Math.sin(theta) * (baseRadius + len * 0.5),
            );
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
        }
        ctx.restore();
    }
}
