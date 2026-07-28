import { describe, expect, it } from 'vitest';
import { AudioFeatures, FEATURE_BAR_COUNT } from './audio-features';

/**
 * The auto-gain contract that fixed the "normalization is failing" bug:
 * bars/bands must reach high values on a loud stream (whose raw bytes the
 * old code let pin at the analyser ceiling) AND on a quiet stream (which
 * the old code left near zero) — 1.0 means "loud for this station", not an
 * absolute level.
 */
describe('AudioFeatures auto-gain', () => {
    const SAMPLE_RATE = 48_000;
    const frames = (f: AudioFeatures, data: Uint8Array<ArrayBuffer>, count: number) => {
        let last = f.update(data, 16, SAMPLE_RATE);
        for (let i = 1; i < count; i++) last = f.update(data, 16, SAMPLE_RATE);
        return last;
    };

    it('drives bands and bars toward 1 on a loud stream', () => {
        const features = new AudioFeatures();
        const loud = new Uint8Array(1024).fill(230);
        const levels = frames(features, loud, 40);
        expect(levels.bass).toBeGreaterThan(0.85);
        expect(levels.mid).toBeGreaterThan(0.85);
        expect(levels.treble).toBeGreaterThan(0.85);
        expect(features.bars[10]).toBeGreaterThan(0.8);
        expect(features.bars[FEATURE_BAR_COUNT - 10]).toBeGreaterThan(0.8);
    });

    it('amplifies a quiet stream instead of leaving it near zero', () => {
        const features = new AudioFeatures();
        // 28/255 ≈ 0.11 raw — the old un-normalized code drew this as a
        // nearly flat line.
        const quiet = new Uint8Array(1024).fill(28);
        const levels = frames(features, quiet, 40);
        expect(levels.bass).toBeGreaterThan(0.5);
        expect(features.bars[10]).toBeGreaterThan(0.5);
    });

    it('stays at zero on silence — the floor keeps noise from being amplified into a full-scale display', () => {
        const features = new AudioFeatures();
        const silence = new Uint8Array(1024);
        const levels = frames(features, silence, 20);
        expect(levels.bass).toBe(0);
        expect(levels.energy).toBe(0);
        expect(features.bars[10]).toBe(0);
    });

    it('never exceeds 1 even when the level jumps past the tracked peak', () => {
        const features = new AudioFeatures();
        const quiet = new Uint8Array(1024).fill(30);
        frames(features, quiet, 30);
        const loud = new Uint8Array(1024).fill(250);
        const levels = frames(features, loud, 2);
        expect(levels.bass).toBeLessThanOrEqual(1);
        expect(levels.treble).toBeLessThanOrEqual(1);
        for (const bar of features.bars) expect(bar).toBeLessThanOrEqual(1);
    });
});
