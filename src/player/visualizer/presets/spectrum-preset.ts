import type { FrameContext, VisualizerPreset } from '../types';

const BAR_COUNT = 96;

/**
 * The original single preset: a rotating, zoom-pulsing, hue-cycling radial
 * spectrum. Bass drives the zoom pulse, mid drives rotation speed, treble
 * drives the center glow's brightness.
 */
export class SpectrumPreset implements VisualizerPreset {
    readonly id = 'spectrum';
    readonly label = 'Radial Spectrum';

    private angle = 0;
    private zoom = 1;

    reset(): void {
        this.angle = 0;
        this.zoom = 1;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, data, bass, mid, treble } = fc;

        const targetZoom = 1 + (bass / 255) * 0.35;
        this.zoom += (targetZoom - this.zoom) * 0.12;
        this.angle += (0.0006 + (mid / 255) * 0.0025) * dt;

        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * 0.16;
        const maxBarLength = Math.min(width, height) * 0.34;

        // Trails instead of a hard clear — a translucent fill leaves a
        // fading afterimage, the cheapest feedback-buffer approximation
        // canvas 2D can do.
        ctx.fillStyle = 'rgba(6, 8, 16, 0.22)';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        ctx.scale(this.zoom, this.zoom);

        const hueBase = (ts / 40) % 360;
        for (let i = 0; i < BAR_COUNT; i++) {
            const bin = Math.floor((i / BAR_COUNT) * data.length);
            const value = data[bin] ?? 0;
            const pct = value / 255;
            const barLength = baseRadius * 0.1 + pct * maxBarLength;
            const theta = (i / BAR_COUNT) * Math.PI * 2;
            const hue = (hueBase + (i / BAR_COUNT) * 180) % 360;
            const lightness = 45 + pct * 25;

            ctx.strokeStyle = `hsl(${hue.toFixed(1)} 85% ${lightness.toFixed(1)}%)`;
            ctx.lineWidth = Math.max(1.5, (Math.min(width, height) / BAR_COUNT) * 0.9);
            ctx.beginPath();
            ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            ctx.lineTo(Math.cos(theta) * (baseRadius + barLength), Math.sin(theta) * (baseRadius + barLength));
            ctx.stroke();
        }

        // A soft inner glow whose brightness tracks treble, so the center
        // doesn't read as a dead hole during quiet passages.
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hueBase.toFixed(1)}, 70%, ${(30 + (treble / 255) * 30).toFixed(1)}%, 0.35)`;
        ctx.fill();

        ctx.restore();
    }
}
