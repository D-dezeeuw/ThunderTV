import type { FrameContext, VisualizerPreset } from '../types';
import { barAt, decay } from './preset-utils';

/** Odd count on purpose: an even segment count makes opposite wedges line up into a tidy mandala, which is the opposite of what this preset wants. */
const SEGMENTS = 7;
const SPIKES_PER_WEDGE = 22;
/** Bounds the beat "camera shake" to a few pixels — violent, not nauseating. */
const MAX_SHAKE_PX = 8;
const MAX_SHARDS = 5;

interface Shard {
    points: Array<[number, number]>;
    /** Which mirrored segment this shard belongs to — one only, never all of them. That single-segment placement is what breaks the symmetry. */
    segment: number;
    life: number;
    maxLife: number;
}

/**
 * Metal: aggressive, red, violent — a kaleidoscope that refuses to be
 * symmetric. The wedge is built once per frame into an offscreen buffer and
 * mirrored around the circle like `kaleidoscope-preset.ts`, but three
 * things deliberately break the symmetry that preset works so hard for:
 *
 *  - An **odd** segment count, so a mirrored wedge never has a matching
 *    partner directly opposite it.
 *  - Each segment is drawn at its own **rotation offset and brightness**,
 *    both driven by a different slice of the spectrum, so the "identical"
 *    copies visibly disagree with each other.
 *  - **Shards** (lightning splinters) are stamped into a *single* segment
 *    on hard beats, after the mirroring — one wedge lights up while its
 *    siblings stay dark.
 *
 * Every beat also reverses the spin and kicks a bounded shake. Treble
 * (shredding) drives both spin rate and the jagged noise on the spikes.
 */
export class MetalPreset implements VisualizerPreset {
    readonly id = 'metal';
    readonly label = 'Metal';

    private buffer: HTMLCanvasElement | null = null;
    private width = 0;
    private height = 0;
    private angle = 0;
    private direction = 1;
    private shake = 0;
    private shards: Shard[] = [];
    /** Per-segment rotation wobble, so mirrored copies drift out of lockstep. */
    private segmentPhase: number[] = [];

    reset(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.buffer = document.createElement('canvas');
        this.buffer.width = width;
        this.buffer.height = height;
        this.angle = 0;
        this.direction = 1;
        this.shake = 0;
        this.shards = [];
        this.segmentPhase = Array.from({ length: SEGMENTS }, (_, i) => i * 1.7);
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, bars, bass, mid, treble, beat, beatIntensity } = fc;
        if (!this.buffer || width !== this.width || height !== this.height)
            this.reset(width, height);
        const buffer = this.buffer;
        if (!buffer) return;
        const bctx = buffer.getContext('2d');
        if (!bctx) return;

        const maxRadius = Math.min(width, height) * 0.5;
        const wedgeAngle = (Math.PI * 2) / SEGMENTS;

        if (beat) {
            this.direction *= -1;
            this.shake = Math.min(1, 0.4 + beatIntensity * 0.6);
            if (beatIntensity > 0.5 && this.shards.length < MAX_SHARDS) {
                this.shards.push(makeShard(maxRadius, wedgeAngle));
            }
        }
        this.shake = decay(this.shake, 0.985, dt);
        this.angle += (0.0008 + treble * 0.004) * dt * this.direction;

        // Trails, plus a soft red wash riding the bass — a smooth swell
        // (alpha capped low), deliberately not a beat-keyed strobe.
        ctx.fillStyle = 'rgba(2, 0, 0, 0.36)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = `hsla(0, 80%, 30%, ${(bass * 0.1).toFixed(2)})`;
        ctx.fillRect(0, 0, width, height);

        // --- Build one wedge of jagged spikes into the buffer ---
        bctx.clearRect(0, 0, width, height);
        bctx.save();
        bctx.translate(width / 2, height / 2);
        bctx.beginPath();
        bctx.moveTo(0, 0);
        bctx.arc(0, 0, maxRadius, 0, wedgeAngle);
        bctx.closePath();
        bctx.clip();

        const baseRadius = maxRadius * 0.14;
        for (let i = 0; i < SPIKES_PER_WEDGE; i++) {
            const u = i / SPIKES_PER_WEDGE;
            const v = barAt(bars, u);
            // Noise keyed to the angle (integer cycles) so it stays
            // continuous where the wedge repeats, not to the loop index.
            const theta = u * wedgeAngle;
            const jagged = (Math.sin(ts * 0.02 + theta * 11) + 1) * 0.5;
            const len = maxRadius * (v * 0.72 + jagged * 0.26 * treble);

            bctx.strokeStyle = `hsl(0 90% ${(24 + v * 48).toFixed(1)}%)`;
            bctx.lineWidth = 2 + v * 3;
            bctx.beginPath();
            bctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            bctx.lineTo(Math.cos(theta) * (baseRadius + len), Math.sin(theta) * (baseRadius + len));
            bctx.stroke();
        }
        bctx.restore();

        // --- Stamp the wedge around the circle, each copy disagreeing ---
        const cx = width / 2 + (Math.random() - 0.5) * this.shake * MAX_SHAKE_PX;
        const cy = height / 2 + (Math.random() - 0.5) * this.shake * MAX_SHAKE_PX;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);
        ctx.globalCompositeOperation = 'lighter';
        for (let s = 0; s < SEGMENTS; s++) {
            // Each segment listens to its own band and drifts by its own
            // wobble, so the copies never quite agree — asymmetry inside an
            // otherwise kaleidoscopic layout.
            const segLevel = barAt(bars, (s / SEGMENTS) * 0.9);
            this.segmentPhase[s] =
                (this.segmentPhase[s] ?? 0) + (0.0002 + segLevel * 0.0012) * dt * (s % 2 ? -1 : 1);
            const wobble = Math.sin(this.segmentPhase[s] ?? 0) * wedgeAngle * 0.14;

            ctx.save();
            if (s % 2 === 0) ctx.rotate(s * wedgeAngle + wobble);
            else {
                // Mirrored copy of [0, θ] lands on [s·θ, (s+1)·θ] only when
                // the rotation is (s+1)·θ — same fix as the kaleidoscope.
                ctx.rotate((s + 1) * wedgeAngle + wobble);
                ctx.scale(1, -1);
            }
            ctx.globalAlpha = 0.45 + segLevel * 0.55 + mid * 0.15;
            ctx.drawImage(buffer, -width / 2, -height / 2);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // --- Shards: one segment only, so the burst is never mirrored ---
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const shard = this.shards[i];
            if (!shard) continue;
            shard.life += dt;
            if (shard.life >= shard.maxLife) {
                this.shards.splice(i, 1);
                continue;
            }
            const fade = 1 - shard.life / shard.maxLife;
            ctx.save();
            ctx.rotate(shard.segment * wedgeAngle);
            ctx.strokeStyle = `hsla(0, 30%, 90%, ${(fade * 0.8).toFixed(2)})`;
            ctx.lineWidth = 1.5 + fade * 2.5;
            ctx.beginPath();
            shard.points.forEach(([x, y], k) => {
                if (k === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }
}

function makeShard(maxRadius: number, wedgeAngle: number): Shard {
    const heading = Math.random() * wedgeAngle;
    const points: Array<[number, number]> = [];
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
        const r = (s / steps) * maxRadius;
        const wobble = s === 0 || s === steps ? 0 : (Math.random() - 0.5) * 0.45;
        points.push([Math.cos(heading + wobble) * r, Math.sin(heading + wobble) * r]);
    }
    return {
        points,
        segment: Math.floor(Math.random() * SEGMENTS),
        life: 0,
        maxLife: 180,
    };
}
