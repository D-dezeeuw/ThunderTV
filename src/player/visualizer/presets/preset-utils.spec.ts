import { describe, expect, it } from 'vitest';
import { barAt, barAtMirrored, fadeTrails, floorToBlack } from './preset-utils';

interface RecordedFill {
    op: GlobalCompositeOperation;
    style: string;
}

/**
 * A canvas 2D stand-in that records what each `fillRect` would actually
 * composite. `supportsBurn: false` reproduces a browser without blend-mode
 * support, where assigning an unrecognised operation is silently ignored —
 * the case where painting the near-white floor source anyway would blow the
 * whole frame out to white.
 */
function recordingCtx(supportsBurn = true): {
    ctx: CanvasRenderingContext2D;
    fills: RecordedFill[];
} {
    const fills: RecordedFill[] = [];
    let op: GlobalCompositeOperation = 'source-over';
    const ctx = {
        globalAlpha: 1,
        fillStyle: '',
        get globalCompositeOperation(): GlobalCompositeOperation {
            return op;
        },
        set globalCompositeOperation(value: GlobalCompositeOperation) {
            if (value === 'color-burn' && !supportsBurn) return;
            op = value;
        },
        save: () => {},
        restore: () => {
            op = 'source-over';
        },
        fillRect: () => fills.push({ op, style: String(ctx.fillStyle) }),
    } as unknown as CanvasRenderingContext2D & { fillStyle: string };
    return { ctx, fills };
}

describe('fadeTrails — the trail floor', () => {
    it('fades with pure black, backs the frame with black, then burns the residue off', () => {
        const { ctx, fills } = recordingCtx();
        fadeTrails(ctx, 100, 50, 0.22);
        expect(fills).toEqual([
            { op: 'source-over', style: 'rgba(0, 0, 0, 0.22)' },
            { op: 'destination-over', style: '#000' },
            { op: 'color-burn', style: 'rgb(254, 254, 254)' },
        ]);
    });

    it('skips the burn — never paints near-white — where blend modes are unsupported', () => {
        const { ctx, fills } = recordingCtx(false);
        floorToBlack(ctx, 100, 50);
        expect(fills).toEqual([{ op: 'destination-over', style: '#000' }]);
    });
});

describe('barAt', () => {
    it('interpolates between adjacent bars and clamps outside [0, 1]', () => {
        const bars = new Float32Array([0, 1, 0.5]);
        expect(barAt(bars, 0)).toBe(0);
        expect(barAt(bars, 0.25)).toBeCloseTo(0.5);
        expect(barAt(bars, 1)).toBe(0.5);
        expect(barAt(bars, -1)).toBe(0);
        expect(barAt(bars, 2)).toBe(0.5);
    });
});

describe('barAtMirrored — the ring-seam contract', () => {
    // Radial presets sample bars around a circle; where the ring closes,
    // t=0 (loud bass) would sit next to t≈1 (quiet treble) and read as a
    // jarring radius "wall". Mirrored sampling folds the spectrum
    // 0 → 1 → 0 so both seam sides always sample the same band.
    const bars = new Float32Array([0.9, 0.7, 0.4, 0.1]);

    it('samples identically at both ends of the ring', () => {
        expect(barAtMirrored(bars, 0)).toBeCloseTo(barAtMirrored(bars, 1));
    });

    it('is symmetric around the fold: t and 1−t sample the same level', () => {
        for (const t of [0.1, 0.25, 0.4]) {
            expect(barAtMirrored(bars, t)).toBeCloseTo(barAtMirrored(bars, 1 - t));
        }
    });

    it('reaches the top of the spectrum at the fold point', () => {
        expect(barAtMirrored(bars, 0.5)).toBeCloseTo(0.1);
    });
});
