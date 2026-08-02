#!/usr/bin/env node
/**
 * The desktop audio-transcode route, proven in a real renderer.
 *
 * `smoke-desktop.mjs` answers "does the app start and is the transcode
 * server there". This answers the only question that actually matters for
 * the feature: does a film Chromium cannot decode the audio of end up
 * making sound — and still behave like a film afterwards.
 *
 * It generates its own subject with the bundled ffmpeg (H.264 + AC-3, two
 * minutes), serves it over loopback with `Range`, and drives the shipped
 * app: seeds one Recents entry, clicks the row, and watches the decoder
 * counters, the MediaSource timeline, the notice, and the ffmpeg process
 * table through the whole switch.
 *
 * Opt-in, not part of `npm run verify`: it needs `npm ci` in `desktop/` and
 * a minute of wall clock. Run it after touching anything under
 * `src/player/transcode-*`, `src/player/mp4-init.ts` or `desktop/
 * transcode.mjs` — every one of those is MSE-semantics code that jsdom
 * cannot exercise and typing cannot prove. The bug this caught on its first
 * run is the case in point: seeking threw `InvalidStateError: the timestamp
 * offset may not be set while the SourceBuffer's append state is
 * PARSING_MEDIA_SEGMENT`, on a route that had played perfectly for ten
 * seconds beforehand.
 *
 * Usage: node scripts/smoke-desktop-playback.mjs [--json] [--keep]
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdpSession, fetchJson, sleep, startDisplay, waitFor } from './cdp-client.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const jsonOnly = process.argv.includes('--json');
const keep = process.argv.includes('--keep');
const electron = path.join(repoRoot, 'desktop/node_modules/.bin/electron');
const ffmpeg = path.join(repoRoot, 'desktop/node_modules/ffmpeg-static/ffmpeg');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thundertv-playback-'));
const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thundertv-media-'));

const checks = [];
const log = (msg) => {
    if (!jsonOnly) console.log(msg);
};
const record = (name, pass, detail = '') => {
    checks.push({ name, pass, detail });
    log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Live ffmpeg processes. `-x` matches the process *name*: a
 * full-command-line match also matches this script's own shell, which is
 * how the first version of this check reported a leak that never existed.
 */
function countFfmpeg() {
    return String(spawnSync('pgrep', ['-x', 'ffmpeg']).stdout).trim().split('\n').filter(Boolean).length;
}

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        child.stderr.on('data', (chunk) => (err += String(chunk)));
        child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(err))));
    });
}

/** Two minutes of H.264 + AC-3 with a two-second GOP: exactly the file this feature exists for. */
async function makeFilm() {
    const file = path.join(mediaDir, 'ac3-film.mp4');
    await run(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-t', '120', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '50',
        '-pix_fmt', 'yuv420p', '-c:a', 'ac3', '-b:a', '192k', '-movflags', '+faststart', file,
    ]);
    return file;
}

/** A provider that honours `Range`, because both the direct attempt and ffmpeg's `-ss` depend on one that does. */
function serveFilm(file) {
    const body = fs.readFileSync(file);
    const server = http.createServer((req, res) => {
        const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
        const start = range ? Number(range[1]) : 0;
        const end = range && range[2] ? Number(range[2]) : body.length - 1;
        const slice = body.subarray(start, end + 1);
        res.writeHead(range ? 206 : 200, {
            'content-type': 'video/mp4',
            'content-length': String(slice.length),
            'accept-ranges': 'bytes',
            ...(range ? { 'content-range': `bytes ${start}-${end}/${String(body.length)}` } : {}),
        });
        res.end(req.method === 'HEAD' ? undefined : slice);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, url: `http://127.0.0.1:${String(server.address().port)}/ac3-film.mp4` });
        });
    });
}

function launch(display) {
    // The port file survives in the profile, so a second launch would
    // otherwise be read as the first one's (dead) endpoint.
    fs.rmSync(path.join(userDataDir, 'DevToolsActivePort'), { force: true });
    const child = spawn(electron, [
        '.', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        // No click starts this film — the harness does — and Chromium will
        // not autoplay audible media without one.
        '--autoplay-policy=no-user-gesture-required',
        `--user-data-dir=${userDataDir}`, '--remote-debugging-port=0',
    ], { cwd: path.join(repoRoot, 'desktop'), env: { ...process.env, DISPLAY: display }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += String(chunk)));
    child.stderr.on('data', (chunk) => (output += String(chunk)));
    return { child, output: () => output };
}

async function attach(app) {
    const port = await waitFor(() => {
        try {
            return Number(fs.readFileSync(path.join(userDataDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || null;
        } catch {
            return null;
        }
    }, 30_000);
    if (!port) throw new Error(`devtools port never appeared:\n${app.output().slice(-2000)}`);
    const target = await waitFor(async () => {
        const list = await fetchJson(`http://127.0.0.1:${String(port)}/json/list`);
        return Array.isArray(list) ? (list.find((t) => t.type === 'page' && /index\.html$/.test(String(t.url).split('#')[0])) ?? null) : null;
    }, 30_000);
    if (!target) throw new Error(`app window never loaded:\n${app.output().slice(-2000)}`);
    const cdp = await CdpSession.connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await waitFor(() => cdp.evaluate('return document.readyState === "complete";').catch(() => false), 30_000);
    return cdp;
}

/**
 * One Recents entry — a full channel snapshot, which is what
 * `player.zapHistory` holds — so the film can be started the way a viewer
 * starts one: by clicking the row. (Restoring `player.active` does not
 * auto-play, and should not.)
 */
const seedJs = (streamUrl) => `
    const film = { id: 'playback-smoke', sourceId: 'playback-smoke', name: 'AC-3 Test Film',
        streamUrl: ${JSON.stringify(streamUrl)}, logo: null, group: null, kind: 'vod' };
    await new Promise((resolve) => {
        const open = indexedDB.open('thundertv');
        open.onerror = resolve;
        open.onsuccess = () => {
            const tx = open.result.transaction('settings', 'readwrite');
            tx.objectStore('settings').put({ v: 1, data: [film] }, 'player.zapHistory');
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        };
    });
    return true;
`;

const PROBE_JS = `
    const v = document.querySelector('video');
    const notice = document.querySelector('[data-testid="player-notice"]');
    const buffered = [];
    if (v) for (let i = 0; i < v.buffered.length; i++) buffered.push([+v.buffered.start(i).toFixed(1), +v.buffered.end(i).toFixed(1)]);
    return {
        t: Date.now(),
        blob: v ? String(v.currentSrc || v.src).startsWith('blob:') : false,
        currentTime: v ? +v.currentTime.toFixed(2) : -1,
        duration: v && Number.isFinite(v.duration) ? +v.duration.toFixed(2) : -1,
        paused: v ? v.paused : true,
        audioBytes: v ? (v.webkitAudioDecodedByteCount ?? -1) : -1,
        videoBytes: v ? (v.webkitVideoDecodedByteCount ?? -1) : -1,
        buffered,
    };
`;

/** The notice covers a sub-second restart, so it is watched in the page rather than by a poll that would step over it. */
const NOTICE_RECORDER_JS = `
    window.__noticeLog = [];
    setInterval(() => {
        const n = document.querySelector('[data-testid="player-notice"]');
        const text = n && getComputedStyle(n).display !== 'none' ? n.textContent.trim() : '';
        const last = window.__noticeLog[window.__noticeLog.length - 1];
        if (!last || last.text !== text) window.__noticeLog.push({ t: Date.now(), text });
    }, 50);
    return true;
`;

async function main() {
    for (const [what, where] of [['electron', electron], ['ffmpeg', ffmpeg]]) {
        if (!fs.existsSync(where)) throw new Error(`smoke-desktop-playback: no ${what} at ${where} — run \`npm ci\` in desktop/.`);
    }
    const display = startDisplay(log);
    await sleep(500);
    const { server, url } = await serveFilm(await makeFilm());
    log(`film: ${url} (120s, H.264 + AC-3)`);

    // Launch 1 exists only so the app creates its IndexedDB schema; the
    // seed goes into that, and a graceful quit is what flushes it to disk.
    let app = launch(display.display);
    let cdp = await attach(app);
    await sleep(2500);
    await cdp.evaluate(seedJs(url));
    cdp.close();
    app.child.kill('SIGTERM');
    await new Promise((resolve) => {
        app.child.once('exit', resolve);
        setTimeout(resolve, 10_000);
    });

    app = launch(display.display);
    cdp = await attach(app);
    await cdp.evaluate(NOTICE_RECORDER_JS);
    await cdp.evaluate('location.hash = "#/recent"; return true;');
    await sleep(1500);
    const clicked = await cdp.evaluate(`
        const btn = document.querySelector('[data-testid="zap-history-play"]');
        if (!btn) return false;
        btn.click();
        return true;
    `);
    record('a Recents row starts the film (the real user path)', clicked === true);

    const started = Date.now();
    const timeline = [];
    let peakFfmpeg = 0;
    let transcodeAt = null;
    let seekAt = 0;
    while (Date.now() - started < 60_000) {
        const sample = await cdp.evaluate(PROBE_JS).catch(() => null);
        peakFfmpeg = Math.max(peakFfmpeg, countFfmpeg());
        if (sample) timeline.push(sample);
        await sleep(500);
        if (!sample) continue;
        if (!transcodeAt && sample.blob && sample.audioBytes > 0) transcodeAt = Date.now();
        // Seek only once the transcoded stream is settled, and well outside
        // anything buffered — that is the path that has to restart ffmpeg.
        if (!seekAt && transcodeAt && Date.now() - transcodeAt > 8000) {
            seekAt = Date.now();
            log(`seek: -> 95s (was ${String(sample.currentTime)}s, buffered ${JSON.stringify(sample.buffered)})`);
            await cdp.evaluate('document.querySelector("video").currentTime = 95; return true;');
        }
        if (seekAt && Date.now() - seekAt > 15_000) break;
    }

    const direct = timeline.filter((s) => !s.blob && s.videoBytes > 0);
    const transcoded = timeline.filter((s) => s.blob);
    const afterSeek = timeline.filter((s) => s.blob && s.t > seekAt + 1000);
    const silent = direct.filter((s) => s.audioBytes === 0);
    record('direct play decodes video and not one byte of audio (the AC-3 bug)', silent.length > 0 && silent.length === direct.length,
        `${String(silent.length)}/${String(direct.length)} direct samples silent`);
    record('the transcode route engages on its own', transcoded.length > 0,
        transcoded.length > 0 ? `after ${((transcoded[0].t - started) / 1000).toFixed(1)}s` : 'never switched');
    record('the transcoded stream decodes real audio', transcoded.some((s) => s.audioBytes > 0),
        `peak ${String(Math.max(0, ...transcoded.map((s) => s.audioBytes)))} bytes`);
    record('MediaSource carries the film\'s real duration', transcoded.some((s) => Math.abs(s.duration - 120) <= 1.5),
        `durations ${[...new Set(transcoded.map((s) => s.duration))].slice(0, 4).join(', ')}`);

    const past = afterSeek.filter((s) => s.currentTime >= 94);
    record('a seek outside the buffer restarts the transcode there and plays on',
        past.length > 1 && past.at(-1).currentTime > past[0].currentTime,
        past.length > 0 ? `${String(past[0].currentTime)}s -> ${String(past.at(-1).currentTime)}s, buffered ${JSON.stringify(past.at(-1).buffered)}` : 'never reached 95s');
    record('audio keeps decoding after the seek', past.length > 1 && past.at(-1).audioBytes > past[0].audioBytes,
        past.length > 1 ? `${String(past[0].audioBytes)} -> ${String(past.at(-1).audioBytes)} bytes` : 'n/a');

    const noticeLog = await cdp.evaluate('return window.__noticeLog || [];');
    const shown = noticeLog.filter((n) => n.text.length > 0);
    record('the switch is announced, briefly', shown.length > 0, shown[0] ? `"${shown[0].text}"` : 'never shown');
    record('…and the notice is gone once it plays', noticeLog.length > 0 && noticeLog.at(-1).text === '', noticeLog.at(-1)?.text ?? '');
    record('the web build\'s "no sound" message never appears here', !shown.some((n) => /no sound|geen geluid|kein ton/i.test(n.text)),
        shown.map((n) => n.text.slice(0, 28)).join(' | '));

    // Leaving the view is how playback stops in this app (the router's
    // stop-on-tab-switch), and it has to take the ffmpeg with it.
    await cdp.evaluate('location.hash = "#/sources"; return true;');
    await sleep(3000);
    const stopped = await cdp.evaluate(PROBE_JS);
    // Not `src`: Chromium keeps reporting the old blob URL on an element
    // whose attribute has been removed and `load()`ed. The pipeline state is
    // the honest signal.
    record('leaving the view tears the transcoded stream down',
        stopped.paused && stopped.currentTime === 0 && stopped.videoBytes === 0,
        `paused=${String(stopped.paused)} t=${String(stopped.currentTime)} decoded=${String(stopped.videoBytes)}`);
    record('exactly one ffmpeg while playing, none left behind', peakFfmpeg === 1 && countFfmpeg() === 0,
        `peak ${String(peakFfmpeg)}, ${String(countFfmpeg())} after stop`);
    record('no renderer errors during the run', cdp.errors.length === 0, cdp.errors.slice(0, 2).join(' | '));

    try {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(path.join(repoRoot, 'release/smoke'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'release/smoke/playback.png'), Buffer.from(shot.data, 'base64'));
    } catch {
        // A screenshot is a convenience, never a check.
    }

    cdp.close();
    app.child.kill('SIGKILL');
    server.close();
    display.stop();
    return timeline;
}

let timeline = [];
try {
    timeline = await main();
} catch (err) {
    record('harness ran to completion', false, err instanceof Error ? err.message : String(err));
}
if (!keep) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(mediaDir, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.pass);
if (jsonOnly) {
    console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks, samples: timeline.length }, null, 2));
} else if (failed.length === 0) {
    console.log(`\nsmoke-desktop-playback: OK — ${String(checks.length)} checks passed over ${String(timeline.length)} samples`);
} else {
    console.error(`\nsmoke-desktop-playback: ${String(failed.length)} check(s) FAILED:`);
    for (const c of failed) console.error(`  - ${c.name}${c.detail ? `: ${c.detail}` : ''}`);
}
process.exit(failed.length === 0 ? 0 : 1);
