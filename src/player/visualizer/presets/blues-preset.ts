import type { FrameContext, VisualizerPreset } from '../types';

const POINTS = 180;

/**
 * Blues: slow, emotional, understated. A single soulful closed waveform
 * ring that breathes gently with the overall mix rather than reacting to
 * individual beats — deep indigo tones, a near-static rotation, and a long,
 * dreamy trail.
 */
export class BluesPreset implements VisualizerPreset {
    readonly id = 'blues';
    readonly label = 'Blues';

    private angle = 0;
    private breath = 1;

    reset(): void {
        this.angle = 0;
        this.breath = 1;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, dt, data, mid } = fc;

        // Barely-there trail fade — the slowest of any preset, for a long,
        // dreamy afterglow rather than a sharp motion trail.
        ctx.fillStyle = 'rgba(3, 6, 14, 0.045)';
        ctx.fillRect(0, 0, width, height);

        this.angle += 0.00006 * dt;
        const targetBreath = 1 + (mid / 255) * 0.18;
        this.breath += (targetBreath - this.breath) * 0.02;

        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * 0.28 * this.breath;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        ctx.beginPath();
        for (let i = 0; i <= POINTS; i++) {
            const bin = Math.floor((i / POINTS) * data.length * 0.7);
            const value = (data[bin] ?? 0) / 255;
            const r = baseRadius + value * baseRadius * 0.4;
            const theta = (i / POINTS) * Math.PI * 2;
            const x = Math.cos(theta) * r;
            const y = Math.sin(theta) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'hsla(215, 75%, 62%, 0.55)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = 'hsla(225, 70%, 45%, 0.08)';
        ctx.fill();
        ctx.restore();
    }
}
