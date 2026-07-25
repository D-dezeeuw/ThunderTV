#!/usr/bin/env node
// Rewrites a built dist/index.html's import map so a packaged target
// (Electron, webOS — Phases 28-30) loads the vendored Spektrum copy instead
// of the CDN. Depends on the exact import-map JSON shape documented in
// index.html's comment block: one "imports" object, one "spektrum" key,
// double-quoted. Run after `vite build`, before packaging.
//
// Usage:
//   node scripts/package-target.mjs [--dist <path>] [--check]
//
// --check   dry-run: report whether the swap would apply, change nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const distFlagIndex = args.indexOf('--dist');
const distDir = distFlagIndex === -1 ? `${repoRoot}dist` : args[distFlagIndex + 1];
const indexHtmlPath = `${distDir}/index.html`;

const importMapPattern = /("spektrum"\s*:\s*)"[^"]+"/;
const vendoredEntry = '"./vendor/spektrum.min.js"';

const html = readFileSync(indexHtmlPath, 'utf8');
const match = html.match(importMapPattern);

if (!match) {
    console.error(`package-target: no "spektrum" import-map key found in ${indexHtmlPath}`);
    process.exit(1);
}

const alreadySwapped = match[0].includes(vendoredEntry);
if (alreadySwapped) {
    console.log(`package-target: ${indexHtmlPath} already points spektrum at the vendored copy`);
    process.exit(0);
}

if (checkOnly) {
    console.log(
        `package-target: --check — would rewrite "${match[0]}" to "${match[1]}${vendoredEntry}" in ${indexHtmlPath}`,
    );
    process.exit(0);
}

const rewritten = html.replace(importMapPattern, `$1${vendoredEntry}`);
writeFileSync(indexHtmlPath, rewritten);
console.log(`package-target: rewrote ${indexHtmlPath} to load spektrum from ${vendoredEntry}`);
