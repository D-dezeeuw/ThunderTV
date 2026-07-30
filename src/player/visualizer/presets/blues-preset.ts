import type { FrameContext, VisualizerPreset } from '../types';
import { fadeTrails } from './preset-utils';

const POINTS = 240;

/**
 * Blues: slow, emotional, understated. The ring IS the music now — an
 * oscilloscope circle drawn from the actual time-domain waveform (`wave`),
 * so a bent guitar note visibly ripples around the circle and a quiet
 * passage settles into a smooth breathing ring. Deep indigo, near-static
 * rotation, the longest trails of any preset.
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
        const { ctx, width, height, dt, wave, bass, mid, energy } = fc;

        // Barely-there trail fade — the slowest of any preset, for a long,
        // dreamy afterglow rather than a sharp motion trail.
        fadeTrails(ctx, width, height, 0.05);

        this.angle += 0.00007 * dt;
        const targetBreath = 1 + mid * 0.2;
        this.breath += (targetBreath - this.breath) * Math.min(1, dt * 0.002);

        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * 0.28 * this.breath;
        // Waveform deviation scaled by overall level, so loud passages
        // ripple hard and quiet ones barely tremble.
        const amp = baseRadius * (0.1 + energy * 0.45);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        ctx.beginPath();
        for (let i = 0; i <= POINTS; i++) {
            const u = i / POINTS;
            const sampleIndex = Math.floor(u * (wave.length - 1));
            const deviation = ((wave[sampleIndex] ?? 128) - 128) / 128;
            // The first and last waveform samples are unrelated, so an
            // untapered ring has a radius step where it closes — a jarring
            // seam. Taper the deviation to zero over the 5% nearest the
            // join (both sides land on the smooth base circle, matching
            // exactly); the taper point rotates with the ring, so there's
            // no static dead spot to notice.
            const seamWindow = Math.min(1, Math.min(u, 1 - u) / 0.05);
            const r = baseRadius + deviation * amp * seamWindow;
            const theta = u * Math.PI * 2;
            const x = Math.cos(theta) * r;
            const y = Math.sin(theta) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'hsla(215, 75%, 62%, 0.6)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = 'hsla(225, 70%, 45%, 0.06)';
        ctx.fill();

        // Inner glow swelling with the bass — the low end you feel more
        // than hear, kept soft.
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(225, 70%, 40%, ${(0.04 + bass * 0.18).toFixed(2)})`;
        ctx.fill();
        ctx.restore();
    }
}
