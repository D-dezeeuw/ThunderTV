/**
 * Lazy facade over `./visualizer` (~2,000 LOC across the engine and its 12
 * presets, ~22 kB of the entry chunk). The visualizer only ever renders in
 * audio-visual mode — the Radio view, or Live/Categories with audio-only
 * switched on — so every user who never opens Radio was paying for it on
 * first load.
 *
 * The callers are synchronous (`player/bindings.ts`'s `watch()` handler and
 * `state/player.actions.ts`'s `defineFn`s), so this module cannot simply
 * expose promises: it records the latest requested preset/paused/video and
 * applies them once the real module resolves. The recorded state is also
 * what makes the load race-safe — a `stopRadioVisualizer()` arriving while
 * the chunk is still downloading clears `pendingVideo`, and the resolved
 * import then correctly does nothing instead of starting a canvas the user
 * has already navigated away from.
 *
 * Import this, never `./visualizer`, from anything reachable at boot. The
 * real module stays directly importable for its own specs.
 */
type VisualizerModule = typeof import('./visualizer');

let loaded: VisualizerModule | null = null;
let loading: Promise<VisualizerModule> | null = null;

/** Last values requested through this facade, replayed onto the real module once it arrives. */
let wantedPreset = 'auto';
let wantedPaused = false;
let wantedVideo: HTMLVideoElement | null = null;

function load(): Promise<VisualizerModule> {
    loading ??= import('./visualizer').then((module) => {
        loaded = module;
        return module;
    });
    return loading;
}

export function setRadioVisualizerPreset(preference: string): void {
    wantedPreset = preference;
    loaded?.setRadioVisualizerPreset(preference);
}

export function setRadioVisualizerPaused(value: boolean): void {
    wantedPaused = value;
    loaded?.setRadioVisualizerPaused(value);
}

export function startRadioVisualizer(video: HTMLVideoElement): void {
    wantedVideo = video;
    if (loaded !== null) {
        loaded.startRadioVisualizer(video);
        return;
    }
    void load().then((module) => {
        // A stop() (or a navigation away) may have landed while the chunk
        // was still in flight — `wantedVideo` is the authority, not the
        // `video` captured when this call was made.
        const target = wantedVideo;
        if (target === null) return;
        module.setRadioVisualizerPreset(wantedPreset);
        module.setRadioVisualizerPaused(wantedPaused);
        module.startRadioVisualizer(target);
    });
}

export function stopRadioVisualizer(): void {
    wantedVideo = null;
    loaded?.stopRadioVisualizer();
}

/**
 * The "next preset" button. Unlike the setters above there is nothing
 * meaningful to record — cycling advances whatever the real module's
 * current preset is — so this simply waits for the chunk. It is only ever
 * reachable from a control that is on screen in audio-visual mode, by which
 * point `startRadioVisualizer()` has already triggered the same load.
 */
export function cycleRadioVisualizerPreset(): void {
    void load().then((module) => {
        module.cycleRadioVisualizerPreset();
    });
}
