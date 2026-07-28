/** Crossfade duration for every preset switch (auto-advance, "Next visual", or picking one from the dropdown) — long enough to read as a transition, short enough not to feel sluggish on demand. */
const TRANSITION_MS = 700;

/**
 * Crossfade between two presets: the outgoing preset (left running — never
 * reset — so it keeps evolving normally while it fades out) and the
 * incoming one (freshly reset by the caller) each render into their own
 * offscreen buffer every frame; the visible canvas is just the two buffers
 * alpha-blended by elapsed time. The outgoing buffer is seeded from the
 * frame currently on screen — trail-based presets accumulate their look
 * across frames, and starting the fade from a blank buffer made every
 * transition dip to black first.
 */
export class CrossFader {
    private bufferA: HTMLCanvasElement | null = null;
    private bufferB: HTMLCanvasElement | null = null;
    private fromIndex = 0;
    private targetIndex = 0;
    private elapsed = 0;
    private active = false;

    get running(): boolean {
        return this.active;
    }

    /** Index the fade is heading to — used to skip re-starting a fade that's already going there. */
    get target(): number {
        return this.targetIndex;
    }

    /** Starts a fade away from whatever is currently visible on `canvas`. */
    begin(canvas: HTMLCanvasElement, fromIndex: number, toIndex: number): void {
        this.ensureBuffers(canvas.width, canvas.height);
        const actxA = this.bufferA?.getContext('2d');
        if (actxA) {
            actxA.clearRect(0, 0, canvas.width, canvas.height);
            actxA.drawImage(canvas, 0, 0);
        }
        this.bufferB?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        this.fromIndex = fromIndex;
        this.targetIndex = toIndex;
        this.elapsed = 0;
        this.active = true;
    }

    /** Abandons the fade (the caller lands directly on the incoming preset) — e.g. on a resize, which invalidates both buffers anyway. */
    cancel(): void {
        this.active = false;
    }

    /** Full reset, dropping the offscreen buffers too — the test-reset path. */
    reset(): void {
        this.active = false;
        this.bufferA = null;
        this.bufferB = null;
    }

    /**
     * Renders one blended frame, driving both presets through
     * `framePreset(index, targetCtx)`. Returns false when there is nothing
     * to blend (idle, or a buffer context is unavailable) — the caller then
     * renders the active preset directly onto the visible canvas.
     */
    render(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        dt: number,
        framePreset: (index: number, target: CanvasRenderingContext2D) => void,
    ): boolean {
        if (!this.active) return false;
        this.ensureBuffers(canvas.width, canvas.height);
        const actxA = this.bufferA?.getContext('2d');
        const actxB = this.bufferB?.getContext('2d');
        if (!actxA || !actxB || !this.bufferA || !this.bufferB) {
            this.active = false;
            return false;
        }
        framePreset(this.fromIndex, actxA);
        framePreset(this.targetIndex, actxB);

        this.elapsed += dt;
        const t = Math.min(1, this.elapsed / TRANSITION_MS);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.drawImage(this.bufferA, 0, 0);
        ctx.globalAlpha = t;
        ctx.drawImage(this.bufferB, 0, 0);
        ctx.globalAlpha = 1;
        if (t >= 1) this.active = false;
        return true;
    }

    private ensureBuffers(width: number, height: number): void {
        if (!this.bufferA || this.bufferA.width !== width || this.bufferA.height !== height) {
            this.bufferA = document.createElement('canvas');
            this.bufferA.width = width;
            this.bufferA.height = height;
        }
        if (!this.bufferB || this.bufferB.width !== width || this.bufferB.height !== height) {
            this.bufferB = document.createElement('canvas');
            this.bufferB.width = width;
            this.bufferB.height = height;
        }
    }
}
