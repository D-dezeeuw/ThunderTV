#!/usr/bin/env node
// Guards the pinned-Spektrum contract against silent drift:
//   1. index.html's "spektrum" import-map key disappearing (typo, accidental
//      edit), or resolving to something other than the local vendored copy;
//   2. the vendored public/vendor/spektrum.min.js (Feature 01.5) silently
//      diverging from the pinned build's recorded SHA-384 — a corrupted or
//      hand-edited vendor copy fails this check.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const indexHtmlPath = `${repoRoot}index.html`;
const versionJsonPath = `${repoRoot}scripts/spektrum-version.json`;

const indexHtml = readFileSync(indexHtmlPath, 'utf8');
const version = JSON.parse(readFileSync(versionJsonPath, 'utf8'));

const importMapMatch = indexHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!importMapMatch) {
    console.error('check-importmap: no <script type="importmap"> block found in index.html');
    process.exit(1);
}

let importMap;
try {
    importMap = JSON.parse(importMapMatch[1].trim());
} catch (err) {
    console.error('check-importmap: import map block is not valid JSON:', err.message);
    process.exit(1);
}

const spektrumUrl = importMap.imports?.spektrum;
if (!spektrumUrl) {
    console.error('check-importmap: import map is missing the "spektrum" key');
    process.exit(1);
}

// The app loads the *generated* runtime — the vendored bytes with their
// expression-cache cap raised (see scripts/spektrum-csp.mjs's
// `expectedRuntimeSource`). `spektrum.min.js` is still the pinned,
// hash-verified input to that transform, which is what the rest of this
// check guards; it just isn't what the page fetches. Both files stay local,
// so the no-CDN property this check exists for is unchanged.
const expectedLocalUrl = `./${version.runtimePath.replace(/^public\//, '')}`;
if (spektrumUrl !== expectedLocalUrl) {
    console.error(
        `check-importmap: index.html points spektrum at "${spektrumUrl}" but ` +
            `the offline runtime must use "${expectedLocalUrl}".`,
    );
    process.exit(1);
}

// A missing generated runtime is a broken app, not a stale artifact: the
// import map would resolve to nothing and no module would load at all.
if (!existsSync(`${repoRoot}${version.runtimePath}`)) {
    console.error(
        `check-importmap: ${version.runtimePath} is missing — run "npm run spektrum:csp" to generate it.`,
    );
    process.exit(1);
}

const vendoredPath = `${repoRoot}${version.vendoredPath}`;
let vendoredBytes;
try {
    vendoredBytes = readFileSync(vendoredPath);
} catch {
    console.error(`check-importmap: vendored file missing at ${version.vendoredPath}`);
    process.exit(1);
}

const vendoredSha384 = createHash('sha384').update(vendoredBytes).digest('base64');
if (vendoredSha384 !== version.sha384) {
    console.error(
        `check-importmap: ${version.vendoredPath} sha384 is "${vendoredSha384}" but ` +
            `scripts/spektrum-version.json pins "${version.sha384}" — the vendored copy is ` +
            `corrupted or was hand-edited. Restore it with ` +
            `"node scripts/sync-vendor-spektrum.mjs".`,
    );
    process.exit(1);
}

console.log(`check-importmap: OK — Spektrum ${version.version} is local and its vendored copy is verified`);
