import type { FrameContext, VisualizerPreset } from '../types';

const SEGMENTS = 10;
const RAYS = 28;

/**
 * Classic kaleidoscope trick: draw this frame's audio-reactive "source art"
 * into a single wedge of an offscreen buffer (clipped to that wedge's pie
 * slice, so the rest stays transparent), then stamp rotated copies of that
 * buffer around the circle onto the visible canvas, mirroring every other
 * copy. The source art itself drifts slowly and keys off frequency bins, so
 * the repeated pattern keeps reshaping — the "almost random... great
 * pattern" feel — while staying symmetric.
 */
export class KaleidoscopePreset implements VisualizerPreset {
    readonly id = 'kaleidoscope';
    readonly label = 'Kaleidoscope';

    private buffer: HTMLCanvasElement | null = null;
    private width = 0;
    private height = 0;
    private drift = 0;

    reset(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.buffer = document.createElement('canvas');
        this.buffer.width = width;
        this.buffer.height = height;
        this.drift = 0;
    }

    frame(fc: FrameContext): void {
        const { ctx, width, height, ts, dt, data, mid } = fc;
        if (!this.buffer || width !== this.width || height !== this.height)
            this.reset(width, height);
        const buffer = this.buffer;
        if (!buffer) return;
        const bctx = buffer.getContext('2d');
        if (!bctx) return;

        this.drift += (0.0004 + (mid / 255) * 0.0012) * dt;

        const cx = width / 2;
        const cy = height / 2;
        const wedgeAngle = (Math.PI * 2) / SEGMENTS;
        const radius = Math.min(width, height) * 0.5;
        const hueBase = (ts / 35) % 360;

        bctx.clearRect(0, 0, width, height);
        bctx.save();
        bctx.translate(cx, cy);
        // Clip to one pie-slice wedge — everything drawn below only ever
        // lands inside it, so the un-clipped rest of the buffer stays
        // transparent for the mirrored copies to tile against.
        bctx.beginPath();
        bctx.moveTo(0, 0);
        bctx.arc(0, 0, radius, 0, wedgeAngle);
        bctx.closePath();
        bctx.clip();

        for (let i = 0; i < RAYS; i++) {
            const bin = Math.floor((i / RAYS) * data.length);
            const value = (data[bin] ?? 0) / 255;
            const theta = (i / RAYS) * wedgeAngle + Math.sin(this.drift + i) * 0.05;
            const len = radius * 0.15 + value * radius * 0.8;
            const hue = (hueBase + i * 6) % 360;

            bctx.strokeStyle = `hsla(${hue.toFixed(1)}, 90%, 60%, 0.8)`;
            bctx.lineWidth = 2 + value * 3;
            bctx.beginPath();
            bctx.moveTo(0, 0);
            bctx.lineTo(Math.cos(theta) * len, Math.sin(theta) * len);
            bctx.stroke();

            bctx.beginPath();
            bctx.fillStyle = `hsla(${hue.toFixed(1)}, 95%, 70%, 0.9)`;
            bctx.arc(Math.cos(theta) * len, Math.sin(theta) * len, 2 + value * 4, 0, Math.PI * 2);
            bctx.fill();
        }
        bctx.restore();

        ctx.fillStyle = 'rgba(4, 4, 10, 0.2)';
        ctx.fillRect(0, 0, width, height);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.drift * 0.4);
        ctx.globalCompositeOperation = 'lighter';
        for (let s = 0; s < SEGMENTS; s++) {
            ctx.save();
            ctx.rotate(s * wedgeAngle);
            if (s % 2 === 1) ctx.scale(1, -1);
            ctx.drawImage(buffer, -cx, -cy);
            ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }
}
