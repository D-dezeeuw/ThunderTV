import type { FrameContext, VisualizerPreset } from '../types';
import { barAt, decay, fadeTrails } from './preset-utils';

const PARTICLE_COUNT = 150;

interface Particle {
    angle: number;
    radius: number;
    speed: number;
    spin: number;
    hue: number;
    /** Where in the spectrum this particle listens (0..1 into `bars`) — its size breathes with that band, so different particles dance to different instruments. */
    barT: number;
    life: number;
    maxLife: number;
}

/**
 * Floating particles drifting outward from the center in slow orbits,
 * leaving trails (translucent fill instead of a hard clear). Each particle
 * is keyed to its own slice of the spectrum for size, the whole field
 * pulses together on beat, and strong beats fling a burst of fresh
 * particles from the center. A particle that reaches the edge or the end
 * of its life is respawned rather than spliced out — the array stays a
 * fixed size, so there's no per-frame allocation churn.
 */
export class ParticlesPreset implements VisualizerPreset {
    readonly id = 'particles';
    readonly label = 'Particle Storm';

    private particles: Particle[] = [];
    private pulse = 1;
    private burstCursor = 0;
    private width = 0;
    private height = 0;

    reset(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.particles = Array.from({ length: PARTICLE_COUNT }, () => spawn());
        this.pulse = 1;
        this.burstCursor = 0;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bars, bass, treble, beat, beatIntensity } = fc;
        // A resize can land between this preset's activation and its next
        // frame; re-seed rather than drawing particles sized for the old box.
        if (width !== this.width || height !== this.height) this.reset(width, height);

        fadeTrails(ctx, width, height, 0.16);

        // Jumps up sharply on a beat, then eases back down — applied as a
        // shared multiplier so every particle pulses together.
        if (beat) {
            this.pulse = 1 + 0.9 * beatIntensity;
            // Fling a burst of fresh fast particles from the center —
            // recycling the oldest slots keeps the pool size fixed.
            const burstSize = Math.round(5 + beatIntensity * 10);
            const hueBase = (ts / 30) % 360;
            for (let n = 0; n < burstSize; n++) {
                const p = this.particles[this.burstCursor % this.particles.length];
                if (p) Object.assign(p, spawnBurst(hueBase));
                this.burstCursor++;
            }
        }
        this.pulse = 1 + decay(this.pulse - 1, 0.993, dt);

        const cx = width / 2;
        const cy = height / 2;
        const maxRadius = Math.min(width, height) * 0.52;

        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.particles) {
            const level = barAt(bars, p.barT);
            p.angle += p.spin * dt * (1 + treble * 1.5);
            p.radius += p.speed * (dt / 1000) * (0.35 + bass * 1.6);
            p.life += dt;
            if (p.radius > maxRadius || p.life > p.maxLife) Object.assign(p, spawn());

            const x = cx + Math.cos(p.angle) * p.radius;
            const y = cy + Math.sin(p.angle) * p.radius;
            const lifeFade = Math.max(0.12, 1 - p.life / p.maxLife);
            const size = (1 + level * 4 + (p.radius / maxRadius) * 2.5) * this.pulse * lifeFade;
            const alpha = (0.2 + level * 0.55) * lifeFade;

            ctx.beginPath();
            ctx.fillStyle = `hsla(${((p.hue + ts / 50) % 360).toFixed(1)}, 90%, 62%, ${alpha.toFixed(2)})`;
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
    }
}

function spawn(): Particle {
    return {
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * 40,
        speed: 10 + Math.random() * 26,
        spin: (Math.random() - 0.5) * 0.0016,
        hue: Math.random() * 360,
        barT: Math.random(),
        life: 0,
        maxLife: 4000 + Math.random() * 4000,
    };
}

/** Beat-burst variant: fast, short-lived, hue-clustered around the moment's base hue so each burst reads as one event. */
function spawnBurst(hueBase: number): Particle {
    return {
        angle: Math.random() * Math.PI * 2,
        radius: 4 + Math.random() * 16,
        speed: 120 + Math.random() * 160,
        spin: (Math.random() - 0.5) * 0.004,
        hue: (hueBase + Math.random() * 60 - 30 + 360) % 360,
        barT: Math.random() * 0.4,
        life: 0,
        maxLife: 900 + Math.random() * 700,
    };
}
