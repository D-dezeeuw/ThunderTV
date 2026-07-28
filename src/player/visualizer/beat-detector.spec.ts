import { describe, expect, it } from 'vitest';
import { BeatDetector } from './beat-detector';

describe('BeatDetector', () => {
    it('fires once on a bass spike above the running average, then cools down', () => {
        const detector = new BeatDetector();
        // Establish a quiet floor so the average has something to sit at.
        for (let i = 0; i < 60; i++) detector.update(0.2, 16);

        const hit = detector.update(0.9, 16);
        expect(hit.beat).toBe(true);
        expect(hit.intensity).toBeGreaterThan(0);
        expect(hit.intensity).toBeLessThanOrEqual(1);

        // Immediately again: still inside the cooldown window.
        const again = detector.update(0.9, 16);
        expect(again.beat).toBe(false);
        expect(again.intensity).toBe(0);
    });

    it('does not fire on silence or near-silence', () => {
        const detector = new BeatDetector();
        for (let i = 0; i < 30; i++) {
            const info = detector.update(0.05, 16);
            expect(info.beat).toBe(false);
        }
    });

    it('fires again after the cooldown for a fresh spike over a quiet stretch', () => {
        const detector = new BeatDetector();
        for (let i = 0; i < 60; i++) detector.update(0.2, 16);
        expect(detector.update(0.9, 16).beat).toBe(true);
        // Back to quiet long enough for both the cooldown to lapse and the
        // average to settle back down.
        for (let i = 0; i < 60; i++) detector.update(0.2, 16);
        expect(detector.update(0.9, 16).beat).toBe(true);
    });
});
