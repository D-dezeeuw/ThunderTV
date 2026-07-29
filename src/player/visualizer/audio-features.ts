/**
 * Turns the analyser's raw byte spectrum into something presets can
 * actually drive visuals from. Two problems with the raw data made every
 * preset look broken or flat (the "normalization is failing" report):
 *
 *  - **Level**: radio streams differ wildly in loudness. A loud station
 *    pins the low bins at 255 (nothing left to react to), a quiet one
 *    barely moves off zero. Fixed with auto-gain: a fast-attack /
 *    slow-decay running peak per band, and every published value is the
 *    raw level normalized against that peak — so 1.0 always means "loud
 *    for THIS station right now" regardless of stream volume.
 *  - **Frequency**: mapping bars linearly across the FFT wastes half of
 *    them on the dead air above ~10 kHz. `bars` is log-spaced from
 *    F_MIN..F_MAX (how hearing and every real spectrum analyzer work), so
 *    all of them sit on frequencies music actually occupies.
 */

/** Published resolution of `bars` — presets sample it fractionally via `barAt()`, so this only needs to exceed the densest preset's ray count. */
export const FEATURE_BAR_COUNT = 96;

const F_MIN = 35;
const F_MAX = 11_000;

/** A peak below this is treated as this — keeps near-silence from being amplified into full-scale noise. */
const PEAK_FLOOR = 0.12;
/** Per-ms peak decay — roughly halves in 5s, so the gain rides level changes between songs without pumping within one. */
const PEAK_DECAY_PER_MS = 0.99986;

/** Fast-attack / slow-decay running peak — the auto-gain reference level. */
class AutoGain {
    private peak = PEAK_FLOOR;

    /** Feeds one raw level (0..1) and returns the current peak to normalize against. */
    track(value: number, dt: number): number {
        if (value > this.peak) this.peak += (value - this.peak) * 0.4;
        else this.peak = Math.max(PEAK_FLOOR, this.peak * Math.pow(PEAK_DECAY_PER_MS, dt));
        return this.peak;
    }

    norm(value: number, dt: number): number {
        return Math.min(1, value / this.track(value, dt));
    }

    reset(): void {
        this.peak = PEAK_FLOOR;
    }
}

export interface BandLevels {
    bass: number;
    mid: number;
    treble: number;
    energy: number;
}

export class AudioFeatures {
    /** Log-spaced, auto-gained, attack/release-smoothed band levels in [0, 1]. */
    readonly bars = new Float32Array(FEATURE_BAR_COUNT);

    private readonly scratch = new Float32Array(FEATURE_BAR_COUNT);
    private readonly binLo = new Uint16Array(FEATURE_BAR_COUNT);
    private readonly binHi = new Uint16Array(FEATURE_BAR_COUNT);
    private mappedBins = 0;
    private mappedRate = 0;
    private bassRange: [number, number] = [0, 1];
    private midRange: [number, number] = [0, 1];
    private trebleRange: [number, number] = [0, 1];

    private readonly spectrumGain = new AutoGain();
    private readonly bassGain = new AutoGain();
    private readonly midGain = new AutoGain();
    private readonly trebleGain = new AutoGain();

    update(data: Uint8Array<ArrayBuffer>, dt: number, sampleRate: number): BandLevels {
        if (this.mappedBins !== data.length || this.mappedRate !== sampleRate) {
            this.buildMap(data.length, sampleRate);
        }

        // Raw log-spaced bars, then one shared gain from the loudest bar —
        // per-bar gains would erase the spectrum's shape entirely.
        let maxRaw = 0;
        for (let i = 0; i < FEATURE_BAR_COUNT; i++) {
            const lo = this.binLo[i] ?? 0;
            const hi = this.binHi[i] ?? lo + 1;
            let sum = 0;
            for (let b = lo; b < hi; b++) sum += data[b] ?? 0;
            const raw = sum / (hi - lo) / 255;
            if (raw > maxRaw) maxRaw = raw;
            this.scratch[i] = raw;
        }
        const peak = this.spectrumGain.track(maxRaw, dt);
        for (let i = 0; i < FEATURE_BAR_COUNT; i++) {
            const n = Math.min(1, (this.scratch[i] ?? 0) / peak);
            const prev = this.bars[i] ?? 0;
            // Fast attack so hits land the same frame, slower release so
            // decay reads as motion instead of flicker.
            const coef = n > prev ? Math.min(1, dt * 0.035) : Math.min(1, dt * 0.008);
            this.bars[i] = prev + (n - prev) * coef;
        }

        const bass = this.bassGain.norm(this.bandRaw(data, this.bassRange), dt);
        const mid = this.midGain.norm(this.bandRaw(data, this.midRange), dt);
        const treble = this.trebleGain.norm(this.bandRaw(data, this.trebleRange), dt);
        return { bass, mid, treble, energy: (bass + mid + treble) / 3 };
    }

    reset(): void {
        this.bars.fill(0);
        this.scratch.fill(0);
        this.spectrumGain.reset();
        this.bassGain.reset();
        this.midGain.reset();
        this.trebleGain.reset();
    }

    private bandRaw(data: Uint8Array<ArrayBuffer>, range: [number, number]): number {
        const [lo, hi] = range;
        let sum = 0;
        for (let b = lo; b < hi; b++) sum += data[b] ?? 0;
        return sum / Math.max(1, hi - lo) / 255;
    }

    private buildMap(binCount: number, sampleRate: number): void {
        const nyquist = sampleRate / 2;
        const toBin = (hz: number): number =>
            Math.max(0, Math.min(binCount, Math.round((hz / nyquist) * binCount)));
        for (let i = 0; i < FEATURE_BAR_COUNT; i++) {
            const f0 = F_MIN * Math.pow(F_MAX / F_MIN, i / FEATURE_BAR_COUNT);
            const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (i + 1) / FEATURE_BAR_COUNT);
            const lo = Math.min(binCount - 1, toBin(f0));
            this.binLo[i] = lo;
            this.binHi[i] = Math.max(lo + 1, toBin(f1));
        }
        // Musical band edges, not fractions of the FFT: kick/bassline,
        // vocal/melody body, and the hats/air on top.
        this.bassRange = [toBin(35), Math.max(toBin(35) + 1, toBin(250))];
        this.midRange = [toBin(250), Math.max(toBin(250) + 1, toBin(2200))];
        this.trebleRange = [toBin(2200), Math.max(toBin(2200) + 1, toBin(9000))];
        this.mappedBins = binCount;
        this.mappedRate = sampleRate;
    }
}
