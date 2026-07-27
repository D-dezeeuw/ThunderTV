import { describe, expect, it } from 'vitest';
import {
    escalateStashKb,
    estimateStashKb,
    isTopRung,
    MIN_ESCALATION_INTERVAL_MS,
    STALL_WINDOW_MS,
    STASH_LADDER_KB,
    StallTracker,
} from './adaptive-buffer';
import { healthFor } from './stream-health';

const SHALLOW = STASH_LADDER_KB[0] as number;
const MID = STASH_LADDER_KB[1] as number;
const DEEP = STASH_LADDER_KB[2] as number;
const DEEPEST = STASH_LADDER_KB[STASH_LADDER_KB.length - 1] as number;

describe('estimateStashKb', () => {
    it('starts mid-ladder when the Network Information API is unavailable (Safari/Firefox)', () => {
        expect(estimateStashKb(undefined)).toBe(MID);
        expect(estimateStashKb({})).toBe(MID);
    });

    it('buffers deepest on 2g and when the user asked to save data', () => {
        expect(estimateStashKb({ effectiveType: '2g' })).toBe(DEEPEST);
        expect(estimateStashKb({ effectiveType: 'slow-2g' })).toBe(DEEPEST);
        expect(estimateStashKb({ effectiveType: '4g', saveData: true })).toBe(DEEPEST);
    });

    it('splits the very broad 4g bucket by downlink', () => {
        expect(estimateStashKb({ effectiveType: '4g', downlink: 25 })).toBe(SHALLOW);
        expect(estimateStashKb({ effectiveType: '4g', downlink: 2 })).toBe(MID);
        expect(estimateStashKb({ effectiveType: '3g' })).toBe(DEEP);
    });
});

describe('escalateStashKb', () => {
    it('climbs one rung at a time and stops at the top', () => {
        expect(escalateStashKb(SHALLOW)).toBe(MID);
        expect(escalateStashKb(MID)).toBe(DEEP);
        expect(escalateStashKb(DEEPEST)).toBe(DEEPEST);
        expect(isTopRung(DEEPEST)).toBe(true);
        expect(isTopRung(SHALLOW)).toBe(false);
    });
});

describe('StallTracker', () => {
    it('needs two stalls inside the window before escalating', () => {
        const tracker = new StallTracker();
        expect(tracker.shouldEscalate(0)).toBe(false);
        expect(tracker.shouldEscalate(1_000)).toBe(true);
    });

    it('ignores an isolated stall once the window has passed', () => {
        const tracker = new StallTracker();
        expect(tracker.shouldEscalate(0)).toBe(false);
        expect(tracker.shouldEscalate(STALL_WINDOW_MS + 1)).toBe(false);
    });

    it('rate-limits rebuilds — a rebuild is itself an interruption', () => {
        const tracker = new StallTracker();
        tracker.shouldEscalate(0);
        expect(tracker.shouldEscalate(1_000)).toBe(true);

        // More stalls immediately after are suppressed by the cooldown...
        tracker.shouldEscalate(2_000);
        expect(tracker.shouldEscalate(3_000)).toBe(false);

        // ...but they stay in the rolling window, so once the cooldown has
        // passed the very next stall escalates — the link is still bad and
        // waiting for a fresh pair would only prolong it.
        expect(tracker.shouldEscalate(MIN_ESCALATION_INTERVAL_MS + 4_000)).toBe(true);
    });
});

describe('healthFor', () => {
    it('maps recent stall count to the player-bar signal', () => {
        expect(healthFor(0)).toBe('good');
        expect(healthFor(1)).toBe('fair');
        expect(healthFor(2)).toBe('poor');
        expect(healthFor(9)).toBe('poor');
    });
});
