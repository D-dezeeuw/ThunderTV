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
import { fileURLToPath } from 'node:url';

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

// The entry chunk is what every visitor downloads before anything renders,
// so it is the only size worth guarding. The player engines are big
// (hls.js ~509 kB, mpegts.js ~269 kB) and are deliberately behind
// `await import()` in src/player/ — if either ever lands in the entry
// chunk, the browse UI starts paying for a decoder it may never use. That
// is the regression Rollup's generic chunk-size warning cannot distinguish
// from a lazily-loaded chunk simply being large, which is why
// vite.config.ts raises that threshold and this check exists instead.
// Deliberately a size budget rather than a search for library symbols: the
// entry chunk legitimately contains the *specifier* strings ("hls.js",
// "mpegts.js") from its own `await import()` calls, so grepping for those
// can only produce false positives. Size cannot be faked — either engine
// landing in the entry chunk would multiply it several times over.
const ENTRY_BUDGET_BYTES = 200 * 1024;

const entryNames = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1].split('/').pop());

if (entryNames.length === 0) {
    console.error('check-dist: no entry <script src> found in dist/index.html — cannot check the startup budget');
    process.exit(1);
}

for (const name of entryNames) {
    const bytes = statSync(`${assetsDir}/${name}`).size;
    if (bytes > ENTRY_BUDGET_BYTES) {
        console.error(
            `check-dist: entry chunk ${name} is ${(bytes / 1024).toFixed(1)} kB, over the ${String(ENTRY_BUDGET_BYTES / 1024)} kB startup budget.`,
        );
        console.error('  Something that should be lazily imported is now in the initial download —');
        console.error('  most likely a player engine (hls.js / mpegts.js) that stopped being `await import()`ed.');
        process.exit(1);
    }
}

console.log(
    `check-dist: OK — entry chunk(s) ${entryNames.join(', ')} within the ${String(ENTRY_BUDGET_BYTES / 1024)} kB startup budget`,
);
