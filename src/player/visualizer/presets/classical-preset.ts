import type { FrameContext, VisualizerPreset } from '../types';
import { barAt, fadeTrails } from './preset-utils';

const RINGS = 5;
const POINTS_PER_RING = 72;
const MOTE_COUNT = 26;

interface RingLayer {
    speed: number;
    radiusPct: number;
    hue: number;
    /** This ring's register (0..1 into `bars`) — inner rings carry the low strings, outer rings the violins and air, so sections visibly trade phrases. */
    bandT: number;
}

interface Mote {
    x: number;
    y: number;
    vy: number;
    sway: number;
    phase: number;
    size: number;
}

/**
 * Classical: melodic, complex, layered. Concentric rings — each its own
 * "section" of the orchestra, listening to its own register — rotate
 * independently at slow, stately speeds in alternating directions, their
 * outlines rippling with their section's actual level. Golden dust motes
 * drift slowly upward through the field, brightening with the middle
 * voices. Gold/cream and deep-purple palette; deliberately no hard beat
 * jumps — swells, not hits.
 */
export class ClassicalPreset implements VisualizerPreset {
    readonly id = 'classical';
    readonly label = 'Classical';

    private angles: number[] = [];
    private layers: RingLayer[] = [];
    private motes: Mote[] = [];
    private width = 0;
    private height = 0;

    reset(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.angles = new Array(RINGS).fill(0) as number[];
        this.layers = Array.from({ length: RINGS }, (_, i) => ({
            speed: 0.00008 * (i % 2 === 0 ? 1 : -1) * (1 + i * 0.4),
            radiusPct: 0.14 + i * 0.075,
            hue: i % 2 === 0 ? 42 : 268,
            bandT: (i / RINGS) * 0.8,
        }));
        this.motes = Array.from({ length: MOTE_COUNT }, () => spawnMote(width, height, true));
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, dt, bars, mid, energy } = fc;
        if (this.layers.length === 0 || width !== this.width || height !== this.height) {
            this.reset(width, height);
        }

        // A near-imperceptible trail — layers should read as steady and
        // composed, not smeared.
        fadeTrails(ctx, width, height, 0.05);

        const cx = width / 2;
        const cy = height / 2;
        const scale = Math.min(width, height);

        this.layers.forEach((layer, layerIndex) => {
            const level = barAt(bars, layer.bandT + 0.05);
            const speed = layer.speed * (0.4 + level * 1.2);
            this.angles[layerIndex] = (this.angles[layerIndex] ?? 0) + speed * dt;
            const angle = this.angles[layerIndex] ?? 0;
            const radius = scale * layer.radiusPct;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.beginPath();
            for (let i = 0; i <= POINTS_PER_RING; i++) {
                // Each point samples a narrow slice of this ring's own
                // register, so the ripple traces the section's actual
                // voicing instead of the whole mix.
                const within = (i % POINTS_PER_RING) / POINTS_PER_RING;
                const folded = within < 0.5 ? within * 2 : (1 - within) * 2;
                const value = barAt(bars, layer.bandT + folded * 0.18);
                const r = radius + value * scale * 0.045;
                const theta = (i / POINTS_PER_RING) * Math.PI * 2;
                const x = Math.cos(theta) * r;
                const y = Math.sin(theta) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = `hsla(${layer.hue}, 55%, 68%, ${(0.35 + level * 0.35).toFixed(2)})`;
            ctx.lineWidth = 1.2 + level * 2;
            ctx.stroke();
            ctx.restore();
        });

        // Golden dust drifting upward, brightening with the middle voices.
        for (const mote of this.motes) {
            mote.phase += dt * 0.001;
            mote.y -= (mote.vy * dt) / 1000;
            mote.x += Math.sin(mote.phase) * mote.sway;
            if (mote.y < -8) Object.assign(mote, spawnMote(width, height, false));
            ctx.beginPath();
            ctx.fillStyle = `hsla(45, 70%, 70%, ${(0.1 + mid * 0.3).toFixed(2)})`;
            ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
            ctx.fill();
        }

        // A gentle center glow swelling with the whole orchestra.
        ctx.beginPath();
        ctx.arc(cx, cy, scale * 0.08, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(45, 60%, 60%, ${(0.03 + energy * 0.1).toFixed(2)})`;
        ctx.fill();
    }
}

function spawnMote(width: number, height: number, anywhere: boolean): Mote {
    return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : height + 8,
        vy: 6 + Math.random() * 14,
        sway: Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        size: 0.8 + Math.random() * 1.8,
    };
}
