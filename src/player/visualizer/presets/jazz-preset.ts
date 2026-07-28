import type { FrameContext, VisualizerPreset } from '../types';

const RIBBONS = 6;
const POINTS = 90;

interface Ribbon {
    freqA: number;
    freqB: number;
    phase: number;
    bin: number;
    hueOffset: number;
}

/**
 * Jazz: complex, layered, improvisational. Several Lissajous-style ribbons,
 * each keyed to a different frequency bin and drifting at its own slow
 * phase, overlap into an intricate, ever-reshaping pattern rather than one
 * beat-locked pulse — a warm amber/copper palette instead of neon.
 */
export class JazzPreset implements VisualizerPreset {
    readonly id = 'jazz';
    readonly label = 'Jazz';

    private time = 0;
    private ribbons: Ribbon[] = [];

    reset(): void {
        this.time = 0;
        this.ribbons = Array.from({ length: RIBBONS }, (_, i) => ({
            freqA: 2 + i * 0.6,
            freqB: 3 + i * 0.37,
            phase: Math.random() * Math.PI * 2,
            bin: i,
            hueOffset: (i / RIBBONS) * 40,
        }));
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, data, mid } = fc;
        if (this.ribbons.length === 0) this.reset();

        this.time += dt * 0.00028 * (0.6 + mid / 255);

        // A very slow trail fade — long, smooth, overlapping traces read as
        // flowing improvisation rather than a sharp bar chart.
        ctx.fillStyle = 'rgba(10, 6, 2, 0.06)';
        ctx.fillRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const ampBase = Math.min(width, height) * 0.32;
        // Kept in a warm gold/copper band rather than a full hue sweep, for
        // a consistent smoky-club palette.
        const hueBase = 30 + Math.sin(ts / 9000) * 12;

        for (const ribbon of this.ribbons) {
            const binIndex = Math.floor((ribbon.bin / RIBBONS) * data.length * 0.6);
            const value = (data[binIndex] ?? 0) / 255;
            const amp = ampBase * (0.35 + value * 0.65);
            const hue = (hueBase + ribbon.hueOffset) % 360;

            ctx.beginPath();
            ctx.strokeStyle = `hsla(${hue.toFixed(1)}, 70%, 62%, 0.5)`;
            ctx.lineWidth = 1.5 + value * 2;
            for (let i = 0; i <= POINTS; i++) {
                const t = (i / POINTS) * Math.PI * 2;
                const x = cx + Math.sin(ribbon.freqA * t + this.time + ribbon.phase) * amp;
                const y = cy + Math.sin(ribbon.freqB * t + this.time * 1.3 + ribbon.phase) * amp;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }
}
