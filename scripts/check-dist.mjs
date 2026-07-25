#!/usr/bin/env node
// Fails if dist/index.html contains a root-absolute asset reference
// (src="/..." or href="/...") — those break the moment dist/ is served from
// a non-root path: a GitHub Pages subpath (/thundertv/), Electron's
// `file://`, or a packaged webOS app. `base: './'` in vite.config.ts is
// supposed to prevent this; this script is the regression guard.
import { readFileSync } from 'node:fs';
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
