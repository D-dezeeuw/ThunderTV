import type { FrameContext, VisualizerPreset } from '../types';

const RINGS = 4;
const POINTS_PER_RING = 72;

interface RingLayer {
    speed: number;
    radiusPct: number;
    hue: number;
}

/**
 * Classical: melodic, complex, layered. Several concentric spectrum rings —
 * each its own "section" of the orchestra — rotate independently at slow,
 * stately speeds and alternate directions, in a gold/cream and deep-purple
 * palette instead of a single hue sweep.
 */
export class ClassicalPreset implements VisualizerPreset {
    readonly id = 'classical';
    readonly label = 'Classical';

    private angles: number[] = [];
    private layers: RingLayer[] = [];

    reset(): void {
        this.angles = new Array(RINGS).fill(0) as number[];
        this.layers = Array.from({ length: RINGS }, (_, i) => ({
            speed: 0.00008 * (i % 2 === 0 ? 1 : -1) * (1 + i * 0.4),
            radiusPct: 0.18 + i * 0.09,
            hue: i % 2 === 0 ? 42 : 268,
        }));
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, dt, data, mid } = fc;
        if (this.layers.length === 0) this.reset();

        // A near-imperceptible trail — layers should read as steady and
        // composed, not smeared.
        ctx.fillStyle = 'rgba(6, 4, 10, 0.05)';
        ctx.fillRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const scale = Math.min(width, height);

        this.layers.forEach((layer, layerIndex) => {
            const speed = layer.speed * (0.5 + mid / 255);
            this.angles[layerIndex] = (this.angles[layerIndex] ?? 0) + speed * dt;
            const angle = this.angles[layerIndex] ?? 0;
            const radius = scale * layer.radiusPct;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.beginPath();
            for (let i = 0; i <= POINTS_PER_RING; i++) {
                const bin =
                    Math.floor(((i + layerIndex * 11) / POINTS_PER_RING) * data.length * 0.5) %
                    data.length;
                const value = (data[bin] ?? 0) / 255;
                const r = radius + value * scale * 0.05;
                const theta = (i / POINTS_PER_RING) * Math.PI * 2;
                const x = Math.cos(theta) * r;
                const y = Math.sin(theta) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = `hsla(${layer.hue}, 55%, 68%, 0.55)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        });
    }
}
