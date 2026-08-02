// @vitest-environment node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PLAYER_USER_AGENT } from '../scripts/cloudflare-cors-proxy.mjs';
import {
    buildProbeArgs,
    buildTranscodeArgs,
    createTranscodeServer,
    parseProbeOutput,
    resolveFfmpegPath,
    type TranscodeServerHandle,
} from './transcode.mjs';

/**
 * The transcode server, at the two levels worth testing without a browser:
 *
 *  - the pure decisions (which ffmpeg arguments, how a probe's output is
 *    read) — the parts that are wrong silently rather than loudly;
 *  - the HTTP contract, against a *fake* ffmpeg (`spawn` is injectable), so
 *    supersede/abort/failure behaviour is checked on every machine rather
 *    than only where a 78 MB binary happens to be installed.
 *
 * The last block is the real thing end to end — real ffmpeg, real AC-3 in,
 * real AAC out — and skips itself where the binary isn't there (a plain web
 * checkout never runs `npm install` in `desktop/`).
 */

const handles: TranscodeServerHandle[] = [];
const servers: http.Server[] = [];

afterEach(() => {
    for (const handle of handles.splice(0)) handle.close();
    for (const server of servers.splice(0)) server.close();
});

async function start(options: Parameters<typeof createTranscodeServer>[0] = {}): Promise<TranscodeServerHandle> {
    const handle = await createTranscodeServer({ host: '127.0.0.1', port: 0, ...options });
    handles.push(handle);
    return handle;
}

/**
 * A stand-in for ffmpeg: `node -e <script>`, so a spec can decide exactly
 * what the "transcode" writes and when it dies. `buildTranscodeArgs` is
 * bypassed by passing the script through the source URL, which the server
 * treats as opaque.
 */
function fakeSpawn(script: (args: string[]) => string) {
    return (_command: string, args: string[], options: unknown) =>
        spawn(process.execPath, ['-e', script(args)], options as Record<string, never>);
}

/**
 * Reads the front of a response and lets go of it. Every `/stream` body is
 * endless by construction (ffmpeg keeps running until it is killed), so
 * anything that waits for the end — `res.text()` — waits forever; and
 * cancelling through `res.body` after taking a reader throws "locked".
 */
async function readSome(res: Response, atLeast = 1): Promise<Buffer> {
    const reader = res.body?.getReader();
    if (!reader) return Buffer.alloc(0);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < atLeast) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            size += value.length;
        }
    }
    await reader.cancel();
    return Buffer.concat(chunks);
}

describe('transcode arguments', () => {
    it('copies video, re-encodes audio, and fragments the MP4', () => {
        const args = buildTranscodeArgs('http://p.example/movie/u/p/1.mkv', 0).join(' ');

        expect(args).toContain('-c:v copy');
        expect(args).toContain('-c:a aac');
        expect(args).toContain('-movflags frag_keyframe+empty_moov+default_base_moof');
        expect(args).toContain('-f mp4 pipe:1');
        // Capital V: a lowercase `v` also matches an MKV's cover image, and
        // a film whose "video stream" is the poster is one frame long.
        expect(args).toContain('-map 0:V:0?');
    });

    it('seeks on the input side, and only when there is somewhere to seek to', () => {
        const args = buildTranscodeArgs('http://p.example/1.mkv', 754.25);
        expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
        expect(args[args.indexOf('-ss') + 1]).toBe('754.250');
        expect(buildTranscodeArgs('http://p.example/1.mkv', 0)).not.toContain('-ss');
    });

    // ffmpeg rejects http-protocol options outright for any other input
    // ("Option reconnect not found."), so they cannot be unconditional.
    it('only passes http reconnect options for http(s) inputs', () => {
        expect(buildTranscodeArgs('http://p.example/1.mkv', 0)).toContain('-reconnect');
        expect(buildTranscodeArgs('/tmp/local.mkv', 0)).not.toContain('-reconnect');
        expect(buildProbeArgs('https://p.example/1.mkv')).toContain('-reconnect');
        expect(buildProbeArgs('/tmp/local.mkv')).not.toContain('-reconnect');
    });

    // A panel that 403s `Lavf/61.1.100` and serves `VLC/3.0.20` is the
    // difference between "the film has no sound" and "the film has sound",
    // and the app's other client has always sent the latter.
    it('asks the panel under the same identity the proxy uses, on both commands', () => {
        for (const args of [buildTranscodeArgs('http://p.example/1.mkv', 0), buildProbeArgs('http://p.example/1.mkv')]) {
            expect(args[args.indexOf('-user_agent') + 1]).toBe(PLAYER_USER_AGENT);
            expect(args.indexOf('-user_agent')).toBeLessThan(args.indexOf('-i'));
        }
        expect(buildTranscodeArgs('/tmp/local.mkv', 0)).not.toContain('-user_agent');
    });
});

describe('probe output', () => {
    it('reads duration and the source audio codec out of ffmpeg header dump', () => {
        const result = parseProbeOutput(
            [
                "Input #0, matroska,webm, from 'http://p/1.mkv':",
                '  Duration: 01:47:03.42, start: 0.000000, bitrate: 8123 kb/s',
                '  Stream #0:0(eng): Video: h264 (High), yuv420p, 1920x1080',
                '  Stream #0:1(eng): Audio: eac3, 48000 Hz, 5.1(side), fltp, 640 kb/s',
            ].join('\n'),
        );

        expect(result.durationSec).toBeCloseTo(6423.42, 2);
        expect(result.audioCodec).toBe('eac3');
    });

    it('reports nulls rather than guesses when ffmpeg said nothing useful', () => {
        expect(parseProbeOutput('Server returned 404 Not Found')).toEqual({ durationSec: null, audioCodec: null });
    });
});

describe('transcode server HTTP contract', () => {
    const emit = "process.stdout.write(Buffer.from('ftypiso5-fake-fmp4')); setInterval(() => {}, 1000);";

    it('serves the stream with the duration and start-offset headers exposed to a file:// renderer', async () => {
        const handle = await start({
            ffmpegPath: '/fake/ffmpeg',
            spawn: fakeSpawn((args) =>
                // The probe call has no `-f mp4` in it; answer it on stderr
                // the way ffmpeg would, and the stream call on stdout.
                args.includes('pipe:1')
                    ? emit
                    : "process.stderr.write('  Duration: 00:41:20.50, start: 0.0\\n  Stream #0:1: Audio: ac3, 48000 Hz\\n')",
            ),
        });

        const res = await fetch(`${handle.origin}/stream?token=${handle.token}&t=12.5&src=http%3A%2F%2Fp%2F1.mkv`);
        const body = await readSome(res);

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('video/mp4');
        expect(res.headers.get('x-thundertv-duration')).toBe('2480.500');
        expect(res.headers.get('x-thundertv-start')).toBe('12.500');
        expect(res.headers.get('x-thundertv-source-audio')).toBe('ac3');
        // Without this the renderer can read none of the above: it fetches
        // from a `file://` page, which is a cross-origin request.
        expect(res.headers.get('access-control-expose-headers')).toContain('x-thundertv-duration');
        expect(body.toString('latin1')).toContain('fake-fmp4');
    });

    it('refuses an unknown token, a non-http source, and any other path', async () => {
        const handle = await start({ ffmpegPath: '/fake/ffmpeg', spawn: fakeSpawn(() => emit) });
        const src = 'src=http%3A%2F%2Fp%2F1.mkv';

        expect((await fetch(`${handle.origin}/stream?token=nope&${src}`)).status).toBe(403);
        expect((await fetch(`${handle.origin}/stream?token=${handle.token}&src=file%3A%2F%2F%2Fetc%2Fpasswd`)).status).toBe(400);
        expect((await fetch(`${handle.origin}/elsewhere`)).status).toBe(404);
    });

    it('reports a build with no ffmpeg through /status instead of a broken stream', async () => {
        const handle = await start({ ffmpegPath: null });

        const status = (await fetch(`${handle.origin}/status`)).json() as Promise<{ ok: boolean; ffmpeg: boolean }>;
        expect(await status).toEqual({ ok: true, ffmpeg: false });
        expect((await fetch(`${handle.origin}/stream?token=${handle.token}&src=http%3A%2F%2Fp%2F1.mkv`)).status).toBe(503);
    });

    // The whole error story for the renderer: a file ffmpeg cannot read has
    // to fail as an HTTP status, not as a 200 that dies two bytes later —
    // there is no way to put a message on screen once a media element has
    // started consuming a body.
    it('answers 502 when ffmpeg dies before producing any output', async () => {
        const handle = await start({
            ffmpegPath: '/fake/ffmpeg',
            spawn: fakeSpawn((args) =>
                args.includes('pipe:1')
                    ? "process.stderr.write('Server returned 404 Not Found'); process.exit(1);"
                    : "process.stderr.write('  Duration: 00:10:00.00\\n')",
            ),
        });

        const res = await fetch(`${handle.origin}/stream?token=${handle.token}&src=http%3A%2F%2Fp%2F1.mkv`);

        expect(res.status).toBe(502);
        expect(await res.text()).toContain('404 Not Found');
    });

    // One process per session is the rule the seek path depends on: a seek
    // is a second `/stream` for the same film, and the first must die then
    // and there rather than keep pulling the provider's bandwidth.
    it('kills the running transcode when a second stream request arrives', async () => {
        const pidFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-transcode-')), 'pids');
        const handle = await start({
            ffmpegPath: '/fake/ffmpeg',
            spawn: fakeSpawn((args) =>
                args.includes('pipe:1')
                    ? `require('fs').appendFileSync(${JSON.stringify(pidFile)}, process.pid + '\\n');` +
                      "process.stdout.write('x'); setInterval(() => {}, 1000);"
                    : "process.stderr.write('  Duration: 00:10:00.00\\n')",
            ),
        });
        const url = (t: number): string => `${handle.origin}/stream?token=${handle.token}&t=${String(t)}&src=http%3A%2F%2Fp%2F1.mkv`;

        await readSome(await fetch(url(0)));
        const [firstPid] = fs.readFileSync(pidFile, 'utf8').trim().split('\n');
        await readSome(await fetch(url(600)));

        await expect.poll(() => isRunning(Number(firstPid)), { timeout: 5_000 }).toBe(false);
    });
});

function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * End to end with the bundled binary: an AC-3 file (the exact thing
 * Chromium cannot decode) goes in, and what comes back has to be a
 * fragmented MP4 whose audio is AAC — which is the entire premise of the
 * feature, and the one part no amount of mocking can vouch for.
 */
const ffmpegPath = resolveFfmpegPath();

describe.skipIf(!ffmpegPath)('transcode server with the bundled ffmpeg', () => {
    async function serveFixture(): Promise<string> {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-transcode-media-'));
        const file = path.join(dir, 'ac3.mp4');
        await run(ffmpegPath as string, [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25',
            '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
            '-t', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '25',
            '-pix_fmt', 'yuv420p', '-c:a', 'ac3', '-b:a', '192k',
            '-movflags', '+faststart', file,
        ]);

        // Range, because a provider serving VOD supports it and ffmpeg uses
        // it: without it an `-ss` into the middle of a film would have to
        // read its way there through the whole file.
        const server = http.createServer((req, res) => {
            const body = fs.readFileSync(file);
            const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
            const start = range ? Number(range[1]) : 0;
            const end = range && range[2] ? Number(range[2]) : body.length - 1;
            const slice = body.subarray(start, end + 1);
            res.writeHead(range ? 206 : 200, {
                'content-type': 'video/mp4',
                'content-length': String(slice.length),
                'accept-ranges': 'bytes',
                ...(range ? { 'content-range': `bytes ${String(start)}-${String(end)}/${String(body.length)}` } : {}),
            });
            res.end(req.method === 'HEAD' ? undefined : slice);
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        return `http://127.0.0.1:${String(typeof address === 'object' && address ? address.port : 0)}/ac3.mp4`;
    }

    it('turns an AC-3 file into a fragmented MP4 with AAC audio, seekable by t=', async () => {
        const source = await serveFixture();
        const handle = await start();
        const pull = async (t: number): Promise<{ res: Response; head: Buffer }> => {
            const res = await fetch(`${handle.origin}/stream?token=${handle.token}&t=${String(t)}&src=${encodeURIComponent(source)}`);
            return { res, head: await readSome(res, 64_000) };
        };

        const { res, head } = await pull(0);
        expect(res.status).toBe(200);
        // The probe read the real file, so the renderer gets a real duration
        // to hand MediaSource — that is what makes the scrub bar work.
        expect(Number(res.headers.get('x-thundertv-duration'))).toBeCloseTo(30, 0);
        expect(res.headers.get('x-thundertv-source-audio')).toBe('ac3');
        // ftyp, then a moov with no samples in it, then fragments: the shape
        // MediaSource requires, and the reason nothing is buffered to disk.
        expect(head.toString('latin1', 4, 8)).toBe('ftyp');
        expect(head.toString('latin1', 0, 4_000)).toContain('moov');
        expect(head.toString('latin1', 0, 8_000)).toContain('moof');
        // The one assertion the whole feature exists for.
        expect(head.toString('latin1', 0, 4_000)).toContain('mp4a');
        expect(head.toString('latin1', 0, 4_000)).not.toContain('ac-3');

        const seeked = await pull(20);
        expect(seeked.res.status).toBe(200);
        expect(seeked.head.toString('latin1', 4, 8)).toBe('ftyp');
        // Seeking really did move: 10 seconds of film is materially less
        // data than 30, and it arrives without re-reading what came before.
        expect(seeked.head.length).toBeGreaterThan(0);
    }, 120_000);
});

function run(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        child.stderr.on('data', (chunk: Buffer) => (err += String(chunk)));
        child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(err))));
    });
}
