import { describe, expect, it } from 'vitest';
import { barAt, barAtMirrored } from './preset-utils';

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
