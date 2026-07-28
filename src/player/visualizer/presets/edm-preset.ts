import type { FrameContext, VisualizerPreset } from '../types';
import { barAtMirrored, decay } from './preset-utils';

const BAR_COUNT = 64;
const MAX_RINGS = 14;

interface BeatRing {
    radius: number;
    alpha: number;
    hue: number;
    speed: number;
    width: number;
}

/**
 * EDM: fast-moving and beat-heavy. Two counter-rotating neon bar rings
 * (the second dimmer and phase-flipped in hue, so the layers visibly slide
 * across each other), a scale-punch on every kick, and expanding beat
 * rings whose speed and thickness scale with how hard the onset hit.
 * No full-screen strobe — kept to smooth color/brightness pulses for
 * photosensitivity safety.
 */
export class EdmPreset implements VisualizerPreset {
    readonly id = 'edm';
    readonly label = 'EDM';

    private angle = 0;
    private kick = 0;
    private hueJump = 0;
    private rings: BeatRing[] = [];

    reset(): void {
        this.angle = 0;
        this.kick = 0;
        this.hueJump = 0;
        this.rings = [];
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bars, bass, beat, beatIntensity } = fc;
        const cx = width / 2;
        const cy = height / 2;
        const maxRadius = Math.min(width, height) * 0.5;

        // Fast trail fade for snappy, sharp motion rather than a smear.
        ctx.fillStyle = 'rgba(4, 2, 10, 0.3)';
        ctx.fillRect(0, 0, width, height);

        if (beat) {
            this.kick = Math.min(1.4, this.kick + 0.5 + beatIntensity * 0.5);
            this.hueJump = (this.hueJump + 40 * beatIntensity) % 360;
            if (this.rings.length < MAX_RINGS) {
                this.rings.push({
                    radius: maxRadius * 0.08,
                    alpha: 0.9,
                    hue: (ts / 10 + this.hueJump) % 360,
                    speed: 0.28 + beatIntensity * 0.4,
                    width: 3 + beatIntensity * 5,
                });
            }
        }
        this.kick = decay(this.kick, 0.992, dt);
        this.angle += (0.0018 + bass * 0.005 + this.kick * 0.003) * dt;

        const hueBase = (ts / 14 + this.hueJump) % 360;
        const baseRadius = maxRadius * 0.16;
        const punch = 1 + this.kick * 0.05;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(punch, punch);
        this.drawBarRing(ctx, bars, this.angle, baseRadius, maxRadius, hueBase, 1, 1);
        this.drawBarRing(
            ctx,
            bars,
            -this.angle * 0.7,
            baseRadius * 0.94,
            maxRadius,
            (hueBase + 180) % 360,
            0.7,
            0.45,
        );

        // Bass glow at the center — a smooth swell, never a strobe.
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 0.75, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hueBase.toFixed(1)}, 95%, 60%, ${(bass * 0.28).toFixed(2)})`;
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const ring = this.rings[i];
            if (!ring) continue;
            ring.radius += ring.speed * dt * (0.6 + bass * 0.8);
            ring.alpha -= dt * 0.0016;
            if (ring.alpha <= 0 || ring.radius > maxRadius) {
                this.rings.splice(i, 1);
                continue;
            }
            ctx.beginPath();
            ctx.strokeStyle = `hsla(${ring.hue.toFixed(1)}, 95%, 65%, ${ring.alpha.toFixed(2)})`;
            ctx.lineWidth = ring.width;
            ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    private drawBarRing(
        ctx: CanvasRenderingContext2D,
        bars: Float32Array,
        angle: number,
        baseRadius: number,
        maxRadius: number,
        hueBase: number,
        lengthScale: number,
        alpha: number,
    ): void {
        ctx.save();
        ctx.rotate(angle);
        for (let i = 0; i < BAR_COUNT; i++) {
            const u = i / BAR_COUNT;
            const v = barAtMirrored(bars, u);
            const theta = u * Math.PI * 2;
            const len = baseRadius * 0.15 + v * maxRadius * 0.55 * lengthScale;
            const hue = (hueBase + u * 300) % 360;

            ctx.strokeStyle = `hsla(${hue.toFixed(1)}, 95%, ${(52 + v * 28).toFixed(1)}%, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            ctx.lineTo(Math.cos(theta) * (baseRadius + len), Math.sin(theta) * (baseRadius + len));
            ctx.stroke();
        }
        ctx.restore();
    }
}
