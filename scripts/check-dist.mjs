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
//
// Then: the size budgets, plus three cheap file-level assertions (no HTML
// comments in the built shell, no PNG over 40 KiB, no two files with
// identical bytes).
//
// `--dist <path>` points it at a different build. `dist-webos` selects the
// webOS budget block; `npm run build:lg` runs exactly that before packaging.
import { createHash } from 'node:crypto';
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

// vite.config.ts's `minifyIndexHtml()` strips every comment from the built
// shell. It already fails the build if it matches too few, but that guard
// lives in the plugin; this one is the outside check that the plugin ran at
// all — a `plugins:` edit that drops it puts ~35 KiB of prose back on the
// critical path and nothing else would notice.
if (html.includes('<!--')) {
    console.error(
        `check-dist: ${indexHtmlPath} still contains HTML comments — vite.config.ts's minifyIndexHtml() did not run.`,
    );
    process.exit(1);
}

console.log('check-dist: OK — built HTML carries no comments');

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
// 101 → 102 for the Guide's programme-detail modal: ~0.55 KiB gzip, of which
// a third is the generated CSP expression registry growing by its dozen
// bindings (public/vendor/spektrum-precompiled.js — every template expression
// in index.html has an entry). Nothing here is lazy-loadable: the Guide's
// selectors and actions are registered at boot like every other view's, and
// the modal is markup in the one index.html. Eager *raw* — the metric that
// models TV parse work — went 352.5 → 354.6 KiB, still 45 KiB inside its own
// budget. The Codex/handoff note above is still the honest way back down.
//
// 102 → 104 for the no-sound work (HEVC transcode fix + codec badges and
// learned markers), which costs 2.0 KiB gz eager: the marker store and the
// codec judgement are read synchronously while catalog rows are published, so
// there is no lazy seam to hide them behind. Two things were measured rather
// than assumed before moving the number. Trimming the feature's own prose —
// registry descriptions, warning copy, the video-probe table — bought
// 0.13 KiB, i.e. nothing; and stubbing out `registerCodexActions()`/
// `registerCodexLibraryActions()` and their two boot tasks dropped the eager
// bundle by **4.3 KiB gz**, more than twice what this feature costs. So the
// Codex path named above is not a vague aspiration, it is measured and it is
// still the way back under 101 — a lazy shim per `data-fn`, plus a decision
// about whether those two boot tasks may wait for Settings to open. That is a
// piece of work in its own right, which is why it is written down here rather
// than rushed in alongside an unrelated fix.
//
// The HTML gates went 300/60 → 115/17 the moment `minifyIndexHtml()`
// (vite.config.ts) started stripping comments and indentation from the *built*
// shell: 239.9 → 111.3 KiB raw, 32.5 → 16.1 KiB gzip. That is formatting, not
// features, so the budget follows it down immediately — the whole point of the
// plugin's strict strip-count guard is that a reformat which stops matching
// fails the build, and a slack budget here would let it fail quietly instead.
// shellText follows for the same reason: 800/175 → 520/128.
//
// `installRaw` 10 MiB → 2 MiB after scripts/generate-icons.mjs started
// compressing what it emits: the 1920×1080 boot wallpaper and the Electron
// splash became WebP and the icon set became palette PNG, taking dist/ from
// 4.44 to 1.81 MiB without touching a master under assets/. The old 10 MiB
// ceiling was never a budget, just a tripwire; 2 MiB is one.
//
// 104 → 102 gzip / 400 → 330 raw once the generated CSP expression registry
// stopped emitting a literal `with` wrapper per record. 543 of 768 template
// expressions are a plain (or negated) dotted path and now ship as bare
// strings fed to one shared path walker: 92.9 → 49.8 KiB raw, 8.81 → 7.16
// gzip. Raw is the metric that models parse work on the TV and it moved 43
// KiB — this is the item the 101→102→104 notes above kept deferring to, and
// it did not cost a single feature.
//
// 102 → 97 gzip / 330 → 300 raw once the four eager-but-unreached graphs went
// behind action shims (the `subtitle-search.actions.ts` pattern): Codex
// export/import and the shared-Codex library, the 10 KiB EPG country table,
// the Electron-only ffmpeg transcode route, and handoff. Eager 317.6 → 288.9
// KiB raw, 101.6 → 94.8 gzip. That closes out the standing note above: the
// answer to "how does this get back under 101" was these four plus the
// registry compaction, and neither took a feature away.
const WEB_BUDGETS = {
    startupJsRaw: 300 * 1024,
    startupJsGzip: 97 * 1024,
    htmlRaw: 115 * 1024,
    htmlGzip: 17 * 1024,
    cssRaw: 100 * 1024,
    cssGzip: 25 * 1024,
    shellTextRaw: 455 * 1024,
    shellTextGzip: 121 * 1024,
    installRaw: 2 * 1024 * 1024,
};

/**
 * `npm run build:lg` had no size gate at all, which is backwards: the webOS
 * build is the one running on the weakest hardware, and it is *bigger* than
 * the web build, not smaller. `target: 'chrome87'` down-levels syntax
 * (+7.2 KiB raw / +1.8 KiB gzip of eager JS today, plus a small
 * `defineProperty` helper chunk), and `package-target.mjs webos` adds
 * `tv-mode.css` on top of the normal stylesheets.
 *
 * So it gets its own block rather than sharing the web numbers — a shared
 * budget would either be slack for web or permanently red for TV. Everything
 * not listed falls back to the web value, so a new gate is enforced on both
 * targets by default and only diverges when it has a measured reason to.
 */
const WEBOS_BUDGET_OVERRIDES = {
    startupJsGzip: 99 * 1024,
    shellTextRaw: 465 * 1024,
    shellTextGzip: 124 * 1024,
};

const isWebos = path.basename(distDir.replace(/[/\\]$/, '')) === 'dist-webos';
const BUDGETS = isWebos ? { ...WEB_BUDGETS, ...WEBOS_BUDGET_OVERRIDES } : WEB_BUDGETS;

/**
 * Two file-level assertions, both regression guards for wins that are easy to
 * undo by accident:
 *
 *  - No shipped PNG over 40 KiB. `scripts/generate-icons.mjs` emits palette
 *    PNGs and WebP; committing a raw 8-bit RGB export straight out of an image
 *    tool is exactly how dist/ got to 4.4 MiB, and it is invisible in review.
 *  - No two files in the tree with identical bytes. `public/favicon.svg` and
 *    `src/styles/thunder-bolt.svg` were the same 9,522 bytes under two names
 *    and both shipped; the same mistake with the wallpaper or a font would
 *    cost far more.
 */
const MAX_PNG_BYTES = 40 * 1024;

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

function walkFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const item = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walkFiles(item));
        else files.push(item);
    }
    return files;
}
const distFiles = walkFiles(distDir);
const installRaw = distFiles.reduce((bytes, file) => bytes + statSync(file).size, 0);

const oversizedPngs = distFiles
    .filter((file) => file.endsWith('.png') && statSync(file).size > MAX_PNG_BYTES)
    .map((file) => `${path.relative(distDir, file)}: ${(statSync(file).size / 1024).toFixed(1)} KiB`);
if (oversizedPngs.length > 0) {
    console.error(`check-dist: PNG over ${String(MAX_PNG_BYTES / 1024)} KiB — recompress it, or emit WebP:`);
    for (const entry of oversizedPngs) console.error(`  ${entry}`);
    console.error('  Every shipped image comes from scripts/generate-icons.mjs; add it there rather than by hand.');
    process.exit(1);
}

const byDigest = new Map();
for (const file of distFiles) {
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    const group = byDigest.get(digest);
    if (group) group.push(file);
    else byDigest.set(digest, [file]);
}
const duplicateGroups = [...byDigest.values()].filter((group) => group.length > 1);
if (duplicateGroups.length > 0) {
    console.error('check-dist: byte-identical files shipped more than once:');
    for (const group of duplicateGroups) {
        console.error(`  ${group.map((file) => path.relative(distDir, file)).join(' == ')}`);
    }
    process.exit(1);
}

console.log(
    `check-dist: OK — ${String(distFiles.length)} shipped file(s), none duplicated, no PNG over ${String(MAX_PNG_BYTES / 1024)} KiB`,
);
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
