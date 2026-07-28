/**
 * Rolling-average bass-onset detector. Flags exactly one frame per detected
 * beat (a spike well above the recent bass average), with a cooldown so a
 * single loud hit doesn't fire twice while it's still ringing out. Shared
 * across presets — particle size pulses, the fractal tunnel's zoom kick,
 * etc. all key off the same `beat` flag rather than each reimplementing
 * onset detection.
 */
export class BeatDetector {
    private avg = 0;
    private cooldownMs = 0;

    /** Feeds one frame's bass average (0-255) and elapsed ms; returns whether a beat fired this frame. */
    update(bass: number, dt: number): boolean {
        this.cooldownMs = Math.max(0, this.cooldownMs - dt);
        const isBeat = this.cooldownMs <= 0 && bass > this.avg * 1.3 && bass > 24;
        // Smoothed after the comparison, not before — the average must lag
        // the current sample to have something to spike above.
        this.avg += (bass - this.avg) * 0.06;
        if (isBeat) this.cooldownMs = 140;
        return isBeat;
    }

    reset(): void {
        this.avg = 0;
        this.cooldownMs = 0;
    }
}
