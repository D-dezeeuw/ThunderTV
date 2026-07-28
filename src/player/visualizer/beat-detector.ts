export interface BeatInfo {
    beat: boolean;
    /** 0..1 — how far above the running average the onset spiked. Presets scale their reactions by this, so a soft jazz accent and an EDM kick don't produce the same jump. */
    intensity: number;
}

/**
 * Rolling-average bass-onset detector, operating on the auto-gained bass
 * level (0..1) from `audio-features.ts` — NOT raw analyser bytes. That
 * matters: raw bytes pin at 255 on loud streams (the default analyser
 * ceiling clips), and a pinned signal can never spike 30% above its own
 * average, which is why beats never fired before the auto-gain existed.
 * Flags exactly one frame per detected beat, with a cooldown so a single
 * hit doesn't fire twice while it rings out.
 */
export class BeatDetector {
    private avg = 0;
    private cooldownMs = 0;

    /** Feeds one frame's normalized bass (0..1) and elapsed ms. */
    update(bass: number, dt: number): BeatInfo {
        this.cooldownMs = Math.max(0, this.cooldownMs - dt);
        const threshold = this.avg * 1.3 + 0.03;
        const over = bass - threshold;
        const isBeat = this.cooldownMs <= 0 && over > 0 && bass > 0.15;
        // Smoothed after the comparison, not before — the average must lag
        // the current sample to have something to spike above.
        this.avg += (bass - this.avg) * Math.min(1, dt * 0.004);
        if (!isBeat) return { beat: false, intensity: 0 };
        this.cooldownMs = 200;
        return { beat: true, intensity: Math.min(1, 0.35 + over * 1.8) };
    }

    reset(): void {
        this.avg = 0;
        this.cooldownMs = 0;
    }
}
