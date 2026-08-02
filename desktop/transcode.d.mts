/**
 * Ambient declaration for `transcode.mjs` — the same arrangement
 * `scripts/proxy-server.d.mts` describes: the module itself is plain JS
 * (Electron main-process code, `allowJs` stays `false` project-wide), and
 * this exists so `transcode.spec.mts` can import it under type checking.
 */
import type { ChildProcess, spawn as nodeSpawn } from 'node:child_process';
import type { Server } from 'node:http';

export interface TranscodeServerOptions {
    host?: string;
    port?: number;
    /** Overrides binary discovery; `null` makes the server behave like a build with no ffmpeg in it. */
    ffmpegPath?: string | null;
    /** Injection seam for the specs — the real one is `node:child_process`'s. */
    spawn?: typeof nodeSpawn | ((command: string, args: string[], options: unknown) => ChildProcess);
}

export interface TranscodeServerHandle {
    server: Server;
    /** Required on every `/stream` request: this server hands an arbitrary URL to a subprocess. */
    token: string;
    ffmpegPath: string | null;
    origin: string;
    /** Kills whatever is transcoding, then stops listening. */
    close(): void;
}

export interface ProbeResult {
    durationSec: number | null;
    audioCodec: string | null;
}

export function resolveFfmpegPath(): string | null;
export function buildTranscodeArgs(src: string, atSeconds: number): string[];
export function buildProbeArgs(src: string): string[];
export function parseProbeOutput(text: string): ProbeResult;
export function createTranscodeServer(options?: TranscodeServerOptions): Promise<TranscodeServerHandle>;
