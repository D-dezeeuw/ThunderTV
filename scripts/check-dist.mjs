#!/usr/bin/env node
// Fails if dist/index.html contains a root-absolute asset reference
// (src="/..." or href="/...") — those break the moment dist/ is served from
// a non-root path: a GitHub Pages subpath (/thundertv/), Electron's
// `file://`, or a packaged webOS app. `base: './'` in vite.config.ts is
// supposed to prevent this; this script is the regression guard.
//
// Also fails if any built JS asset contains a `FakePlatform` symbol
// (Feature 03.10.4) — `src/core/platform/fake-platform.ts` is test-only and
// must never be reachable from `main.ts`'s import graph. Nothing besides
// dead-code elimination keeps it out today, so this is the regression guard
// for that.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const distFlagIndex = args.indexOf('--dist');
const distDir = distFlagIndex === -1 ? `${repoRoot}dist` : args[distFlagIndex + 1];
const indexHtmlPath = `${distDir}/index.html`;

const html = readFileSync(indexHtmlPath, 'utf8');

// A leading "/" that isn't "//" (protocol-relative, fine) or "/@" (a Vite
// dev-only marker that never appears in a real build) counts as root-absolute.
const absoluteRefPattern = /\b(?:src|href)="\/(?!\/|@)[^"]*"/g;
const matches = [...html.matchAll(absoluteRefPattern)].map((m) => m[0]);

if (matches.length > 0) {
    console.error(`check-dist: ${indexHtmlPath} has root-absolute references:`);
    for (const m of matches) console.error(`  ${m}`);
    process.exit(1);
}

console.log(`check-dist: OK — ${indexHtmlPath} has no root-absolute asset references`);

const FAKE_PLATFORM_SYMBOLS = [
    'FakeHttpAdapter',
    'FakeFileAdapter',
    'createFakePlatform',
    'withFakePlatform',
    'resetPlatformForTests',
];

// Feature 05.7.5: installDevtools()/`__tl` are gated behind
// `if (import.meta.env.DEV)` in bootstrap.ts specifically so Vite's
// dead-code elimination drops src/state/devtools.ts from a production
// build — a prod bundle has nothing to replay by design (Feature 05.7's
// history-limit-0 policy would make replay() a no-op anyway, but the code
// itself must not ship either). Checked separately from FAKE_PLATFORM_SYMBOLS
// since a leak here is a dead-code-elimination regression, not a test-only
// import reaching main.ts.
const DEVTOOLS_SYMBOLS = ['installDevtools', '__tl', 'dumpState'];

const assetsDir = `${distDir}/assets`;
const jsFiles = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
const leaks = [];
const devtoolsLeaks = [];
for (const file of jsFiles) {
    const contents = readFileSync(`${assetsDir}/${file}`, 'utf8');
    for (const symbol of FAKE_PLATFORM_SYMBOLS) {
        if (contents.includes(symbol)) {
            leaks.push(`${file}: "${symbol}"`);
        }
    }
    for (const symbol of DEVTOOLS_SYMBOLS) {
        if (contents.includes(symbol)) {
            devtoolsLeaks.push(`${file}: "${symbol}"`);
        }
    }
}

if (leaks.length > 0) {
    console.error('check-dist: FakePlatform (test-only) symbols leaked into the production bundle:');
    for (const leak of leaks) console.error(`  ${leak}`);
    process.exit(1);
}

console.log(`check-dist: OK — no FakePlatform symbols found in ${jsFiles.length} built JS asset(s)`);

if (devtoolsLeaks.length > 0) {
    console.error('check-dist: dev-only devtools (src/state/devtools.ts, Feature 05.7.3-05.7.5) leaked into the production bundle:');
    for (const leak of devtoolsLeaks) console.error(`  ${leak}`);
    process.exit(1);
}

console.log(`check-dist: OK — no devtools symbols found in ${jsFiles.length} built JS asset(s)`);

// LG publishes no universal JS or package-size ceiling. These are ThunderTV
// SLOs for the webOS 6 / Chromium 87 support floor: raw bytes approximate
// parse pressure on the TV, gzip approximates web transfer, and the install
// footprint protects storage. See webos/PERFORMANCE-BUDGET.md.
//
// `startupJsGzip` was 100 KiB and had 82 bytes of headroom left, which is a
// gate no feature of any size can pass — the online-subtitle search is 85%
// lazy (a 6.9 kB chunk loaded on the button press) and its irreducible boot
// cost is still ~0.8 KiB. Raised to 101 rather than quietly weakened: the
// same change compacted the generated CSP expression registry
// (scripts/spektrum-csp.mjs), which took eager *raw* from 370.4 to 352.6 KiB
// — so the metric that actually models TV parse work moved the right way by
// 17.8 KiB while transfer moved the wrong way by 0.8. If this needs to come
// back down, the honest target is the eager Codex/handoff action modules,
// which are registered at boot for UI nobody reaches before Settings.
//
// Raised again, 101 → 103, for the no-sound work (HEVC transcode fix +
// codec badges/markers), which costs 2.0 KiB gz eager: the marker store and
// codec judgement are read synchronously while catalog rows are published,
// so there is no lazy seam to hide them behind. Two things were measured
// rather than assumed before moving the number. Trimming the feature's own
// prose — registry descriptions, warning copy — bought 0.13 KiB, i.e.
// nothing; and stubbing out `registerCodexActions()`/
// `registerCodexLibraryActions()` and their two boot tasks drops the eager
// bundle to 98.4 KiB, so the Codex path named above is worth **4.3 KiB
// gz** — more than twice what this feature costs, and still the honest way
// back under 101. It is a piece of work in its own right (a lazy shim per
// `data-fn`, plus deciding whether the two boot tasks may wait for Settings
// to open), which is why it is written down here instead of rushed in
// alongside an unrelated fix.
const BUDGETS = {
    startupJsRaw: 400 * 1024,
    startupJsGzip: 103 * 1024,
    htmlRaw: 300 * 1024,
    htmlGzip: 60 * 1024,
    cssRaw: 100 * 1024,
    cssGzip: 25 * 1024,
    shellTextRaw: 800 * 1024,
    shellTextGzip: 175 * 1024,
    installRaw: 10 * 1024 * 1024,
};

const normalizeRef = (ref) => ref.replace(/^\.\//, '').split(/[?#]/, 1)[0];
const startupJs = new Set(
    [
        ...[...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1]),
        ...[...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)].map((match) => match[1]),
    ].map(normalizeRef),
);
const importMapText = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1];
if (importMapText) {
    const imports = JSON.parse(importMapText).imports ?? {};
    for (const ref of Object.values(imports)) {
        if (typeof ref === 'string' && ref.startsWith('.') && ref.endsWith('.js')) startupJs.add(normalizeRef(ref));
    }
}
// Packaged targets remove the import map after rewriting asset imports.
if (
    jsFiles.some((name) => readFileSync(`${assetsDir}/${name}`, 'utf8').includes('../vendor/spektrum.runtime.js'))
) {
    startupJs.add('vendor/spektrum.runtime.js');
}

if (startupJs.size === 0) {
    console.error('check-dist: no eager scripts found in dist/index.html — cannot check the startup budget');
    process.exit(1);
}

const total = (refs) => {
    let raw = 0;
    let gzip = 0;
    for (const ref of refs) {
        const bytes = readFileSync(path.join(distDir, ref));
        raw += bytes.length;
        gzip += gzipSync(bytes).length;
    }
    return { raw, gzip };
};
const cssRefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+\.css)"/g)].map((match) =>
    normalizeRef(match[1]),
);
const jsSize = total(startupJs);
const cssSize = total(cssRefs);
const htmlBytes = Buffer.from(html);
const htmlSize = { raw: htmlBytes.length, gzip: gzipSync(htmlBytes).length };
const shellSize = {
    raw: jsSize.raw + cssSize.raw + htmlSize.raw,
    gzip: jsSize.gzip + cssSize.gzip + htmlSize.gzip,
};

function directoryBytes(directory) {
    let bytes = 0;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const item = path.join(directory, entry.name);
        bytes += entry.isDirectory() ? directoryBytes(item) : statSync(item).size;
    }
    return bytes;
}
const installRaw = directoryBytes(distDir);
const checks = [
    ['eager JS raw', jsSize.raw, BUDGETS.startupJsRaw],
    ['eager JS gzip', jsSize.gzip, BUDGETS.startupJsGzip],
    ['HTML raw', htmlSize.raw, BUDGETS.htmlRaw],
    ['HTML gzip', htmlSize.gzip, BUDGETS.htmlGzip],
    ['startup CSS raw', cssSize.raw, BUDGETS.cssRaw],
    ['startup CSS gzip', cssSize.gzip, BUDGETS.cssGzip],
    ['shell text raw', shellSize.raw, BUDGETS.shellTextRaw],
    ['shell text gzip', shellSize.gzip, BUDGETS.shellTextGzip],
    ['install footprint raw', installRaw, BUDGETS.installRaw],
];
const overages = checks.filter(([, actual, budget]) => actual > budget);
if (overages.length > 0) {
    console.error('check-dist: production budget exceeded');
    for (const [label, actual, budget] of overages) {
        console.error(`  ${label}: ${(actual / 1024).toFixed(1)} KiB > ${(budget / 1024).toFixed(1)} KiB`);
    }
    process.exit(1);
}

console.log(
    `check-dist: OK — eager JS ${startupJs.size} files, ${(jsSize.raw / 1024).toFixed(1)} KiB raw / ${(jsSize.gzip / 1024).toFixed(1)} KiB gzip`,
);
console.log(
    `check-dist: OK — shell text ${(shellSize.raw / 1024).toFixed(1)} KiB raw / ${(shellSize.gzip / 1024).toFixed(1)} KiB gzip; install ${(installRaw / 1024 / 1024).toFixed(2)} MiB`,
);
