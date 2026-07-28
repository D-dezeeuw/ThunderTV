import type { FrameContext, VisualizerPreset } from '../types';

const BAR_COUNT = 64;
const MAX_RINGS = 14;

interface BeatRing {
    radius: number;
    alpha: number;
    hue: number;
}

/**
 * EDM: fast-moving and beat-heavy. A rapidly rotating neon bar ring, sped up
 * further on every kick, plus expanding "beat rings" that fire on each
 * detected beat and race outward — no full-screen strobe (kept to smooth
 * color/brightness pulses, not stark flicker, for photosensitivity safety).
 */
export class EdmPreset implements VisualizerPreset {
    readonly id = 'edm';
    readonly label = 'EDM';

    private angle = 0;
    private kick = 1;
    private rings: BeatRing[] = [];

    reset(): void {
        this.angle = 0;
        this.kick = 1;
        this.rings = [];
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, data, bass, beat } = fc;
        const cx = width / 2;
        const cy = height / 2;
        const maxRadius = Math.min(width, height) * 0.5;

        // Fast trail fade for snappy, sharp motion rather than a smear.
        ctx.fillStyle = 'rgba(4, 2, 10, 0.32)';
        ctx.fillRect(0, 0, width, height);

        this.kick += ((beat ? 1.8 : 1) - this.kick) * (beat ? 1 : 0.18);
        this.angle += (0.002 + (bass / 255) * 0.01) * dt * this.kick;

        if (beat && this.rings.length < MAX_RINGS) {
            this.rings.push({ radius: maxRadius * 0.08, alpha: 0.9, hue: (ts / 10) % 360 });
        }

        const hueBase = (ts / 14) % 360;
        const baseRadius = maxRadius * 0.14;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        for (let i = 0; i < BAR_COUNT; i++) {
            const bin = Math.floor((i / BAR_COUNT) * data.length);
            const pct = (data[bin] ?? 0) / 255;
            const theta = (i / BAR_COUNT) * Math.PI * 2;
            const len = baseRadius * 0.2 + pct * maxRadius * 0.55 * this.kick;
            const hue = (hueBase + i * 5) % 360;

            ctx.strokeStyle = `hsl(${hue.toFixed(1)} 95% ${(55 + pct * 25).toFixed(1)}%)`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            ctx.lineTo(Math.cos(theta) * (baseRadius + len), Math.sin(theta) * (baseRadius + len));
            ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const ring = this.rings[i];
            if (!ring) continue;
            ring.radius += (0.25 + (bass / 255) * 0.5) * dt;
            ring.alpha -= dt * 0.0016;
            if (ring.alpha <= 0 || ring.radius > maxRadius) {
                this.rings.splice(i, 1);
                continue;
            }
            ctx.beginPath();
            ctx.strokeStyle = `hsla(${ring.hue.toFixed(1)}, 95%, 65%, ${ring.alpha.toFixed(2)})`;
            ctx.lineWidth = 4;
            ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }
}
