/**
 * The seam that keeps the desktop audio-transcode route out of the eager
 * bundle.
 *
 * `transcode-engine.ts` + `transcode-stream.ts` are an MSE pipeline fed by
 * Electron's main-process ffmpeg (`desktop/transcode.mjs`). On web and on a
 * webOS TV there is no `getPlatform().audioTranscode` at all, so none of it
 * can ever run there — yet `engine.ts` statically imported `detachTranscode`
 * for its teardown path and dragged the whole thing into the chunk every
 * target parses before first paint.
 *
 * Everything that can start a session goes through `loadTranscodeEngine()`,
 * so `engine` is non-null before any session can exist. That is what makes
 * the synchronous `detachTranscode()` below correct rather than merely
 * convenient: if the module was never loaded, there is nothing to detach.
 */
let engine: typeof import('./transcode-engine') | null = null;

export async function loadTranscodeEngine(): Promise<typeof import('./transcode-engine')> {
    engine ??= await import('./transcode-engine');
    return engine;
}

/** Tears down any live transcode session. A no-op — and free — on a host that has never started one. */
export function detachTranscode(): void {
    engine?.detachTranscode();
}
