import type { FrameContext, VisualizerPreset } from '../types';
import { barAt } from './preset-utils';

const RIBBONS = 6;
const POINTS = 90;

/**
 * INTEGER frequency pairs only: a Lissajous curve closes at t = 2π exactly
 * when both frequencies are integers. The original fractional values
 * (2.6, 3.37, …) produced figures that never returned to their start —
 * every ribbon had two loose ends hanging mid-air, a visible seam in an
 * otherwise flowing figure. Distinct coprime-ish pairs keep the six
 * ribbons from collapsing onto the same path.
 */
const FREQ_PAIRS: ReadonlyArray<[number, number]> = [
    [2, 3],
    [3, 4],
    [2, 5],
    [3, 5],
    [4, 5],
    [3, 7],
];

interface Ribbon {
    freqA: number;
    freqB: number;
    phase: number;
    /** Where in the spectrum this ribbon listens (0..1 into `bars`) — each ribbon follows a different instrument's register. */
    bandT: number;
    hueOffset: number;
    /** Parameter position of this ribbon's comet dots, advancing with treble. */
    dotT: number;
}

/**
 * Jazz: complex, layered, improvisational. Several Lissajous-style ribbons,
 * each listening to its own register and drifting at its own slow phase,
 * overlap into an intricate, ever-reshaping pattern. Comet dots chase
 * along each curve at treble speed (the soloist), and each beat nudges one
 * ribbon's phase — a little syncopated lurch that rotates around the
 * ensemble. Warm amber/copper palette, long dreamy trails.
 */
export class JazzPreset implements VisualizerPreset {
    readonly id = 'jazz';
    readonly label = 'Jazz';

    private time = 0;
    private ribbons: Ribbon[] = [];
    private beatRotor = 0;

    reset(): void {
        this.time = 0;
        this.beatRotor = 0;
        this.ribbons = Array.from({ length: RIBBONS }, (_, i) => ({
            freqA: FREQ_PAIRS[i % FREQ_PAIRS.length]?.[0] ?? 2,
            freqB: FREQ_PAIRS[i % FREQ_PAIRS.length]?.[1] ?? 3,
            phase: Math.random() * Math.PI * 2,
            bandT: (i / RIBBONS) * 0.85,
            hueOffset: (i / RIBBONS) * 40,
            dotT: Math.random() * Math.PI * 2,
        }));
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bars, mid, treble, beat, beatIntensity } = fc;
        if (this.ribbons.length === 0) this.reset();

        this.time += dt * 0.00026 * (0.5 + mid);

        // Syncopation: each beat nudges ONE ribbon's phase, rotating
        // through the ensemble — the pattern lurches asymmetrically the
        // way a rhythm section trades accents.
        if (beat) {
            const target = this.ribbons[this.beatRotor % this.ribbons.length];
            if (target) target.phase += 0.22 * beatIntensity;
            this.beatRotor++;
        }

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
            const level = barAt(bars, ribbon.bandT);
            const amp = ampBase * (0.3 + level * 0.7);
            const hue = (hueBase + ribbon.hueOffset) % 360;

            ctx.beginPath();
            ctx.strokeStyle = `hsla(${hue.toFixed(1)}, 70%, 62%, ${(0.3 + level * 0.35).toFixed(2)})`;
            ctx.lineWidth = 1.2 + level * 2.5;
            for (let i = 0; i <= POINTS; i++) {
                const t = (i / POINTS) * Math.PI * 2;
                const x = cx + Math.sin(ribbon.freqA * t + this.time + ribbon.phase) * amp;
                const y = cy + Math.sin(ribbon.freqB * t + this.time * 1.3 + ribbon.phase) * amp;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Comet dots chasing the curve — the "soloist" voice on top of
            // the ensemble, sped up by treble activity.
            ribbon.dotT += dt * (0.0004 + treble * 0.0016);
            for (let d = 0; d < 2; d++) {
                const t = ribbon.dotT + d * Math.PI;
                const x = cx + Math.sin(ribbon.freqA * t + this.time + ribbon.phase) * amp;
                const y = cy + Math.sin(ribbon.freqB * t + this.time * 1.3 + ribbon.phase) * amp;
                ctx.beginPath();
                ctx.fillStyle = `hsla(${hue.toFixed(1)}, 90%, 72%, ${(0.5 + level * 0.4).toFixed(2)})`;
                ctx.arc(x, y, 2 + level * 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}
