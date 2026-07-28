import type { FrameContext, VisualizerPreset } from '../types';
import { barAtMirrored, decay } from './preset-utils';

const BAR_COUNT = 96;

/**
 * Rotating, zoom-pulsing, hue-cycling radial spectrum. Bars are sampled
 * mirrored (left/right halves of the ring reflect each other) from the
 * log-spaced normalized bands, so the whole ring dances instead of one
 * side idling on empty top octaves. Beats punch the zoom, jump the hue,
 * and flash an expanding ring.
 */
export class SpectrumPreset implements VisualizerPreset {
    readonly id = 'spectrum';
    readonly label = 'Radial Spectrum';

    private angle = 0;
    private zoom = 1;
    private kick = 0;
    private hueShift = 0;
    private flash = 0;

    reset(): void {
        this.angle = 0;
        this.zoom = 1;
        this.kick = 0;
        this.hueShift = 0;
        this.flash = 0;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bars, bass, mid, treble, beat, beatIntensity } = fc;

        if (beat) {
            this.kick = Math.min(1, this.kick + 0.3 + beatIntensity * 0.5);
            this.flash = Math.min(1, 0.35 + beatIntensity * 0.65);
            this.hueShift = (this.hueShift + 22 * beatIntensity) % 360;
        }
        this.kick = decay(this.kick, 0.994, dt);
        this.flash = decay(this.flash, 0.99, dt);

        const targetZoom = 1 + bass * 0.26 + this.kick * 0.12;
        this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 0.015);
        this.angle += (0.00035 + mid * 0.0022) * dt;

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

        const hueBase = (ts / 40 + this.hueShift) % 360;
        for (let i = 0; i < BAR_COUNT; i++) {
            const u = i / BAR_COUNT;
            const v = barAtMirrored(bars, u);
            const barLength = baseRadius * 0.08 + v * maxBarLength;
            const theta = u * Math.PI * 2;
            const hue = (hueBase + u * 360) % 360;
            const lightness = 42 + v * 30;

            ctx.strokeStyle = `hsl(${hue.toFixed(1)} 85% ${lightness.toFixed(1)}%)`;
            ctx.lineWidth = Math.max(1.5, (Math.min(width, height) / BAR_COUNT) * 0.9);
            ctx.beginPath();
            ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            ctx.lineTo(
                Math.cos(theta) * (baseRadius + barLength),
                Math.sin(theta) * (baseRadius + barLength),
            );
            ctx.stroke();
        }

        // Beat flash ring, riding just outside the bar ring.
        if (this.flash > 0.03) {
            ctx.strokeStyle = `hsla(${hueBase.toFixed(1)}, 90%, 72%, ${(this.flash * 0.8).toFixed(2)})`;
            ctx.lineWidth = 2 + this.flash * 6;
            ctx.beginPath();
            ctx.arc(0, 0, baseRadius * (1.15 + bass * 0.25), 0, Math.PI * 2);
            ctx.stroke();
        }

        // A soft inner glow whose brightness tracks treble, so the center
        // doesn't read as a dead hole during quiet passages.
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hueBase.toFixed(1)}, 70%, ${(28 + treble * 32).toFixed(1)}%, 0.35)`;
        ctx.fill();

        ctx.restore();
    }
}
