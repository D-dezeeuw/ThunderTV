/**
 * On-the-fly audio transcoding, in the main process.
 *
 * The bug this exists for: Chromium ships no AC-3, E-AC-3 or DTS decoder,
 * and a very large share of movie files carry exactly those. The browser
 * does not fail such a file — it plays the picture and drops the audio
 * track — so the web app's only honest answer is a message saying so
 * (`src/player/audio-output.ts`). On the desktop we own the main process,
 * so there is a better answer than a message: hand the renderer the same
 * film with only its audio re-encoded.
 *
 * `-c:v copy -c:a aac` is the whole trick. The video stream is passed
 * through untouched — no re-encode, no quality loss, no CPU beyond a
 * remux — and only the audio (a couple of hundred kbit/s) actually goes
 * through an encoder, which is cheap enough to run in real time on any
 * machine that can decode the video in the first place. One mechanism
 * covers AC-3, E-AC-3, DTS and TrueHD alike, because none of them are
 * special: they are simply "not AAC".
 *
 * Fragmented MP4 on stdout, not HLS: no temp files, no segment
 * bookkeeping, no second playlist format, and exactly one ffmpeg process
 * for the whole session. The renderer feeds it into MediaSource
 * (`src/player/transcode-engine.ts`), which is also what makes seeking
 * work — a seek outside the buffered range asks for the same source again
 * with a new `t=`, and this server kills the running process and starts a
 * new one at that offset (`-ss` input seek, so it costs a keyframe scan
 * rather than a decode of everything before it).
 *
 * Scope: VOD only. A live transport stream has no duration to seek in and
 * routinely carries MPEG-2 video, which `-c:v copy` into MP4 produces
 * something no browser will play — see `src/player/README.md`.
 *
 * NOTE: this file must stay in `electron-builder.yml`'s `files` allowlist,
 * and the ffmpeg binary in its `extraResources`. That list is default-deny,
 * so a new `desktop/*.mjs` that nobody adds to it is simply absent from the
 * packaged app, and the failure only shows up at runtime in a distributed
 * build (`scripts/check-desktop-package.mjs` guards the module graph half).
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYER_USER_AGENT } from '../scripts/cloudflare-cors-proxy.mjs';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the bundled ffmpeg lives, which moves for the same reason
 * `main.mjs`'s index.html and icon do:
 *   - packaged: `electron-builder.yml` maps `ffmpeg-static` in as
 *     `extraResources`, so from inside `app.asar` it is `../ffmpeg/…` —
 *     outside the archive, which is what keeps the executable bit and lets
 *     the OS exec it at all (a binary inside an asar cannot be run);
 *   - `npm start` from a checkout: plain `node_modules` resolution.
 * `.exe` first on Windows, plain name everywhere else; both spellings are
 * listed rather than branching on `process.platform`, since the answer is
 * "whichever one is actually there".
 */
const FFMPEG_CANDIDATES = [
    path.join(desktopDir, '..', 'ffmpeg', 'ffmpeg.exe'),
    path.join(desktopDir, '..', 'ffmpeg', 'ffmpeg'),
    path.join(desktopDir, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(desktopDir, 'node_modules', 'ffmpeg-static', 'ffmpeg'),
];

/** How long the duration probe may take before the stream starts without one (the player then loses its scrub bar, not its sound). */
const PROBE_TIMEOUT_MS = 20_000;
/** A process that has not produced a single byte by now is not going to. */
const FIRST_BYTE_TIMEOUT_MS = 30_000;
/** Grace between SIGTERM and SIGKILL for a superseded transcode. */
const KILL_GRACE_MS = 2_000;
/** Probed durations are keyed by source URL and never change; the cap only stops an all-night zap session growing it without bound. */
const PROBE_CACHE_CAP = 64;

export function resolveFfmpegPath() {
    for (const candidate of FFMPEG_CANDIDATES) {
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            return candidate;
        } catch {
            // Not this one — try the next candidate.
        }
    }
    return null;
}

/**
 * Reconnect options are options of the *http* protocol: passing them for any
 * other input makes ffmpeg exit with "Option reconnect not found."
 *
 * `-user_agent` is on the same list, and is not cosmetic: ffmpeg introduces
 * itself as `Lavf/<version>`, which a large share of Xtream panels answer
 * with 403/458 — exactly the refusal the app's own requests have always
 * sidestepped by going out as VLC (`PLAYER_USER_AGENT`, imported rather than
 * copied). Two identities asking one panel for one film get two answers, and
 * the viewer sees a film that plays but cannot be transcoded.
 */
function inputOptionsFor(src) {
    if (!/^https?:/i.test(src)) return [];
    // prettier-ignore
    return ['-user_agent', PLAYER_USER_AGENT, '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'];
}

/**
 * The one command this module exists to run.
 *
 * `-ss` before `-i` is an *input* seek: ffmpeg jumps to the keyframe at or
 * before that timestamp instead of decoding its way there, which is what
 * makes a seek into hour two of a film cost a fraction of a second. The
 * cost is that playback resumes from that keyframe rather than the exact
 * requested frame — up to one GOP early, never late, so nothing is skipped.
 *
 * `-map 0:V:0?` is deliberately capital-V: lowercase `v` also matches an
 * attached cover image (routine in MKV), and picking the poster as the
 * video stream produces a film that is one still frame long. The `?`
 * suffixes let an audio-only or video-only file through instead of failing
 * the whole command.
 *
 * Stereo AAC, not a passthrough of the source layout: the point is sound
 * coming out of the speakers of the machine that could not decode the
 * original, and a 5.1 layout is the least reliable way to get there.
 */
export function buildTranscodeArgs(src, atSeconds) {
    const seek = atSeconds > 0 ? ['-ss', atSeconds.toFixed(3)] : [];
    return [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        ...inputOptionsFor(src),
        ...seek,
        '-i',
        src,
        '-map',
        '0:V:0?',
        '-map',
        '0:a:0?',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-ac',
        '2',
        '-b:a',
        '192k',
        '-sn',
        '-dn',
        '-movflags',
        'frag_keyframe+empty_moov+default_base_moof',
        '-f',
        'mp4',
        'pipe:1',
    ];
}

/** `ffmpeg -i <url>` with no output: it prints what it found and exits non-zero, which is the cheapest duration/codec probe available without shipping ffprobe as well. */
export function buildProbeArgs(src) {
    return ['-hide_banner', '-nostdin', ...inputOptionsFor(src), '-i', src];
}

/**
 * Pulls the two facts worth having out of ffmpeg's own header dump: how
 * long the film is (so the renderer can give MediaSource a real duration,
 * and the viewer a real scrub bar) and what its audio actually is (a
 * diagnostic — the whole feature is triggered by the browser's silence, not
 * by trusting this).
 */
export function parseProbeOutput(text) {
    const duration = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(text);
    const audio = /Stream #\d+:\d+[^\n]*?:\s*Audio:\s*([A-Za-z0-9_]+)/.exec(text);
    return {
        durationSec: duration
            ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
            : null,
        audioCodec: audio ? audio[1] : null,
    };
}

/**
 * A localhost HTTP server that answers `/stream` with a transcoded copy of
 * a provider URL, plus a `/status` the smoke test and the renderer use to
 * tell "no ffmpeg in this build" from "this file cannot be transcoded".
 *
 * Loopback-only and token-gated. The proxy next door settles for
 * loopback-only because it is a proxy — this one hands an arbitrary URL to
 * a subprocess, so the extra hurdle is worth the five lines: only a caller
 * that was given the token by the preload bridge can drive it.
 *
 * `spawn` is injectable so the whole HTTP contract — headers, supersede,
 * client-abort, the failed-before-any-output path — is testable without a
 * real ffmpeg on the machine (`transcode.spec.mts`).
 */
export function createTranscodeServer({ host = '127.0.0.1', port = 0, ffmpegPath, spawn = nodeSpawn } = {}) {
    const token = randomUUID();
    const binary = ffmpegPath === undefined ? resolveFfmpegPath() : ffmpegPath;
    const probeCache = new Map();
    /** One transcode at a time, per this server: the renderer only ever plays one thing. */
    let active = null;

    function stopActive() {
        if (!active) return;
        const { child } = active;
        active = null;
        try {
            child.kill('SIGTERM');
        } catch {
            // Already gone.
        }
        const grace = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch {
                // Already gone.
            }
        }, KILL_GRACE_MS);
        // Never hold the process open just to escalate a kill.
        grace.unref?.();
        child.once('exit', () => {
            clearTimeout(grace);
        });
    }

    function probe(src) {
        const cached = probeCache.get(src);
        if (cached) return cached;
        const pending = new Promise((resolve) => {
            let text = '';
            let child;
            try {
                child = spawn(binary, buildProbeArgs(src), { stdio: ['ignore', 'ignore', 'pipe'] });
            } catch {
                resolve({ durationSec: null, audioCodec: null });
                return;
            }
            const timer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch {
                    // Already gone.
                }
            }, PROBE_TIMEOUT_MS);
            timer.unref?.();
            child.stderr?.on('data', (chunk) => {
                text += String(chunk);
            });
            const finish = () => {
                clearTimeout(timer);
                resolve(parseProbeOutput(text));
            };
            child.once('error', finish);
            child.once('close', finish);
        });
        if (probeCache.size >= PROBE_CACHE_CAP) probeCache.delete(probeCache.keys().next().value);
        probeCache.set(src, pending);
        return pending;
    }

    const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        // The renderer is a `file://` page, so every one of these is a
        // cross-origin fetch — and a custom header nobody exposes is a
        // header the renderer cannot read at all.
        const cors = {
            'access-control-allow-origin': '*',
            'access-control-expose-headers': 'x-thundertv-duration, x-thundertv-start, x-thundertv-source-audio',
        };

        if (url.pathname === '/status') {
            res.writeHead(200, { ...cors, 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, ffmpeg: Boolean(binary) }));
            return;
        }
        if (url.pathname !== '/stream') {
            res.writeHead(404, cors);
            res.end();
            return;
        }
        if (url.searchParams.get('token') !== token) {
            res.writeHead(403, cors);
            res.end();
            return;
        }
        const src = url.searchParams.get('src') ?? '';
        if (!/^https?:\/\//i.test(src)) {
            res.writeHead(400, cors);
            res.end('src must be an http(s) URL');
            return;
        }
        if (!binary) {
            res.writeHead(503, cors);
            res.end('no ffmpeg in this build');
            return;
        }
        const requested = Number(url.searchParams.get('t') ?? '0');
        const at = Number.isFinite(requested) && requested > 0 ? requested : 0;
        void startStream(req, res, src, at, cors);
    });

    async function startStream(req, res, src, at, cors) {
        const { durationSec, audioCodec } = await probe(src);
        if (res.destroyed) return;

        // Whatever was playing is being replaced by this request — a seek is
        // literally a new `/stream` for the same film.
        stopActive();
        let child;
        try {
            child = spawn(binary, buildTranscodeArgs(src, at), { stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (err) {
            res.writeHead(500, cors);
            res.end(String(err));
            return;
        }
        const session = { child };
        active = session;

        let stderr = '';
        child.stderr?.on('data', (chunk) => {
            stderr = (stderr + String(chunk)).slice(-2_000);
        });

        // Nothing is written until the first byte of MP4 arrives, so a file
        // ffmpeg cannot read at all comes back as an HTTP error the renderer
        // can act on, rather than as a 200 that dies two bytes later.
        const head = [];
        let headed = false;
        const firstByteTimer = setTimeout(() => {
            if (!headed) stopActive();
        }, FIRST_BYTE_TIMEOUT_MS);
        firstByteTimer.unref?.();

        const onData = (chunk) => {
            head.push(chunk);
            headed = true;
            clearTimeout(firstByteTimer);
            child.stdout.off('data', onData);
            res.writeHead(200, {
                ...cors,
                'content-type': 'video/mp4',
                'cache-control': 'no-store',
                'x-thundertv-duration': durationSec === null ? '' : durationSec.toFixed(3),
                'x-thundertv-start': at.toFixed(3),
                'x-thundertv-source-audio': audioCodec ?? '',
            });
            for (const buffered of head) res.write(buffered);
            // From here `pipe` owns the backpressure: a renderer that stops
            // reading (its buffer is full) stalls the socket, which stalls
            // ffmpeg, which is exactly the throttle a two-hour film needs so
            // it is not downloaded at line speed the moment it starts.
            child.stdout.pipe(res);
        };
        child.stdout.on('data', onData);

        child.once('error', (err) => {
            if (active === session) active = null;
            if (headed) res.destroy();
            else {
                res.writeHead(502, cors);
                res.end(String(err));
            }
        });
        child.once('close', (code) => {
            clearTimeout(firstByteTimer);
            if (active === session) active = null;
            if (headed) {
                res.end();
                return;
            }
            res.writeHead(502, cors);
            res.end(`ffmpeg exited (${String(code)})\n${stderr}`);
        });

        // The viewer pressed stop, switched film, or seeked: the process
        // feeding this response has nobody left to feed.
        res.on('close', () => {
            if (active === session) stopActive();
        });
    }

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            const address = server.address();
            const boundPort = typeof address === 'object' && address ? address.port : port;
            resolve({
                server,
                token,
                ffmpegPath: binary,
                origin: `http://${host}:${String(boundPort)}`,
                close() {
                    stopActive();
                    server.close();
                },
            });
        });
    });
}
