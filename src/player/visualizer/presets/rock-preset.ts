import type { FrameContext, VisualizerPreset } from '../types';
import { barAtMirrored, decay } from './preset-utils';

const SPIKE_COUNT = 44;
const EMBER_COUNT = 48;

interface Ember {
    /** Local (pre-rotation) coordinates — embers live inside the wheel's rotating frame, so they orbit with it while also flying outward. */
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    hue: number;
}

/**
 * Rock: tough and driving, still melodic. Angular spikes with a
 * fast-attack, slow-decay envelope (a punchy snap outward, an easing
 * settle back), a dull silver highlight along each spike for a metallic
 * edge, and an ember red-orange palette. Every beat kicks the spikes and
 * throws a spray of embers off their tips that drift and die like sparks
 * off a grinder.
 */
export class RockPreset implements VisualizerPreset {
    readonly id = 'rock';
    readonly label = 'Rock';

    private angle = 0;
    private envelope: number[] = [];
    private embers: Ember[] = [];
    private emberCursor = 0;
    private kick = 0;

    reset(): void {
        this.angle = 0;
        this.envelope = new Array(SPIKE_COUNT).fill(0) as number[];
        this.embers = [];
        this.emberCursor = 0;
        this.kick = 0;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, dt, bars, bass, beat, beatIntensity } = fc;
        if (this.envelope.length === 0) this.reset();

        ctx.fillStyle = 'rgba(8, 6, 6, 0.22)';
        ctx.fillRect(0, 0, width, height);

        this.angle += (0.00025 + bass * 0.0008) * dt;
        if (beat) this.kick = Math.min(1, 0.4 + beatIntensity * 0.6);
        this.kick = decay(this.kick, 0.991, dt);

        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * 0.15;
        const maxLen = Math.min(width, height) * 0.32;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.angle);

        const tips: Array<[number, number, number]> = [];
        for (let i = 0; i < SPIKE_COUNT; i++) {
            const v = barAtMirrored(bars, i / SPIKE_COUNT);
            const current = this.envelope[i] ?? 0;
            // Attack is instant (take the new peak), release eases down —
            // the spikes snap out on hits and settle back like a struck
            // string.
            this.envelope[i] = v > current ? v : Math.max(0, current - dt * 0.0007);
            const value = this.envelope[i] ?? 0;

            const theta = (i / SPIKE_COUNT) * Math.PI * 2;
            const len = maxLen * value * (1 + this.kick * 0.18);
            const hue = 12 + value * 22;
            const tipX = Math.cos(theta) * (baseRadius + len);
            const tipY = Math.sin(theta) * (baseRadius + len);
            if (value > 0.4) tips.push([tipX, tipY, theta]);

            ctx.strokeStyle = `hsl(${hue.toFixed(1)} 72% ${(38 + value * 32).toFixed(1)}%)`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(theta) * baseRadius, Math.sin(theta) * baseRadius);
            ctx.lineTo(tipX, tipY);
            ctx.stroke();

            // A dull silver highlight along each spike's outer half — a
            // metallic sheen instead of a flat single-color bar.
            ctx.strokeStyle = 'hsla(0, 0%, 78%, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(
                Math.cos(theta) * (baseRadius + len * 0.5),
                Math.sin(theta) * (baseRadius + len * 0.5),
            );
            ctx.lineTo(tipX, tipY);
            ctx.stroke();
        }

        // Beat → spray embers off the hottest spike tips.
        if (beat && tips.length > 0) {
            const sprayCount = Math.round(4 + beatIntensity * 8);
            for (let n = 0; n < sprayCount; n++) {
                const tip = tips[Math.floor(Math.random() * tips.length)];
                if (!tip) continue;
                const [tx, ty, theta] = tip;
                const speed = 60 + Math.random() * 120;
                const jitter = (Math.random() - 0.5) * 1.2;
                const ember: Ember = {
                    x: tx,
                    y: ty,
                    vx: Math.cos(theta + jitter) * speed,
                    vy: Math.sin(theta + jitter) * speed,
                    life: 0,
                    maxLife: 600 + Math.random() * 700,
                    hue: 18 + Math.random() * 22,
                };
                if (this.embers.length < EMBER_COUNT) this.embers.push(ember);
                else this.embers[this.emberCursor++ % EMBER_COUNT] = ember;
            }
        }

        // Embers live in the rotating frame, so they arc with the wheel.
        ctx.globalCompositeOperation = 'lighter';
        for (const e of this.embers) {
            e.life += dt;
            if (e.life >= e.maxLife) continue;
            e.x += (e.vx * dt) / 1000;
            e.y += (e.vy * dt) / 1000;
            const fade = 1 - e.life / e.maxLife;
            ctx.beginPath();
            ctx.fillStyle = `hsla(${e.hue.toFixed(1)}, 90%, 60%, ${(fade * 0.8).toFixed(2)})`;
            ctx.arc(e.x, e.y, 1 + fade * 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }
}
