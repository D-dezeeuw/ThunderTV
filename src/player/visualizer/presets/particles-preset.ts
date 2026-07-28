import type { FrameContext, VisualizerPreset } from '../types';

const PARTICLE_COUNT = 140;

interface Particle {
    angle: number;
    radius: number;
    speed: number;
    spin: number;
    hue: number;
    life: number;
    maxLife: number;
}

/**
 * Floating particles drifting outward from the center in slow orbits,
 * leaving a trail (translucent fill instead of a hard clear) and pulsing in
 * size on beat. A particle that reaches the edge or the end of its life is
 * respawned near the center rather than spliced out — the array stays a
 * fixed size for the whole preset's life, so there's no per-frame
 * allocation churn.
 */
export class ParticlesPreset implements VisualizerPreset {
    readonly id = 'particles';
    readonly label = 'Particle Storm';

    private particles: Particle[] = [];
    private pulse = 1;
    private width = 0;
    private height = 0;

    reset(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.particles = Array.from({ length: PARTICLE_COUNT }, () => spawn());
        this.pulse = 1;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, dt, bass, treble, beat } = fc;
        // A resize can land between this preset's activation and its next
        // frame; re-seed rather than drawing particles sized for the old box.
        if (width !== this.width || height !== this.height) this.reset(width, height);

        ctx.fillStyle = 'rgba(4, 6, 14, 0.16)';
        ctx.fillRect(0, 0, width, height);

        // Jumps up sharply on a beat, then eases back down — the "size
        // changes on beat" ask, applied as a shared multiplier rather than
        // per-particle state so every particle pulses together.
        this.pulse += ((beat ? 1.9 : 1) - this.pulse) * (beat ? 1 : 0.06);

        const cx = width / 2;
        const cy = height / 2;
        const maxRadius = Math.min(width, height) * 0.5;

        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.particles) {
            p.angle += p.spin * dt * (1 + treble / 255);
            p.radius += p.speed * (dt / 1000) * (0.6 + bass / 255);
            p.life += dt;
            if (p.radius > maxRadius || p.life > p.maxLife) Object.assign(p, spawn());

            const x = cx + Math.cos(p.angle) * p.radius;
            const y = cy + Math.sin(p.angle) * p.radius;
            const lifeFade = Math.max(0.15, 1 - p.life / p.maxLife);
            const size = (1.5 + (p.radius / maxRadius) * 3) * this.pulse * lifeFade;

            ctx.beginPath();
            ctx.fillStyle = `hsla(${p.hue.toFixed(1)}, 90%, 62%, ${(0.55 * lifeFade).toFixed(2)})`;
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
        speed: 8 + Math.random() * 22,
        spin: (Math.random() - 0.5) * 0.0015,
        hue: Math.random() * 360,
        life: 0,
        maxLife: 4000 + Math.random() * 4000,
    };
}
