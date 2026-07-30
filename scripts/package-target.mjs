#!/usr/bin/env node
// Rewrites a built dist/index.html for a packaged target (Electron, webOS)
// so it never depends on the Spektrum CDN. webOS additionally gets an
// es-module-shims polyfill for TV engines under Chromium 89, which predates
// native `<script type="importmap">` support, and src/styles/tv-mode.css's
// LG-App-Self-Checklist button/text-size overrides. Run after `vite build`,
// before packaging.
//
// The Spektrum swap depends on the exact import-map JSON shape documented
// in index.html's comment block: one "imports" object, one "spektrum" key,
// double-quoted.
//
// Usage:
//   node scripts/package-target.mjs <electron|webos> [--dist <path>] [--check]
//
// --check   dry-run: report what would change, change nothing.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const distFlagIndex = args.indexOf('--dist');

const target = args.find((a, i) => !a.startsWith('--') && !(distFlagIndex !== -1 && i === distFlagIndex + 1));
if (target !== 'electron' && target !== 'webos') {
    console.error(`package-target: usage: node scripts/package-target.mjs <electron|webos> [--dist <path>] [--check]`);
    process.exit(1);
}

const defaultDistDir = target === 'webos' ? `${repoRoot}dist-webos` : `${repoRoot}dist`;
const distDir = distFlagIndex === -1 ? defaultDistDir : args[distFlagIndex + 1];
const indexHtmlPath = `${distDir}/index.html`;

const importMapPattern = /("spektrum"\s*:\s*)"[^"]+"/;
const vendoredSpektrumEntry = '"./vendor/spektrum.min.js"';
const shimScriptTag = '<script async src="./vendor/es-module-shims.js"></script>';
const importMapTagPattern = /(\s*)(<script type="importmap">)/;

let html = readFileSync(indexHtmlPath, 'utf8');
let changed = false;

const spektrumMatch = html.match(importMapPattern);
if (!spektrumMatch) {
    console.error(`package-target: no "spektrum" import-map key found in ${indexHtmlPath}`);
    process.exit(1);
}

const spektrumAlreadySwapped = spektrumMatch[0].includes(vendoredSpektrumEntry);
if (spektrumAlreadySwapped) {
    console.log(`package-target: ${indexHtmlPath} already points spektrum at the vendored copy`);
} else if (checkOnly) {
    console.log(
        `package-target: --check — would rewrite "${spektrumMatch[0]}" to "${spektrumMatch[1]}${vendoredSpektrumEntry}" in ${indexHtmlPath}`,
    );
} else {
    html = html.replace(importMapPattern, `$1${vendoredSpektrumEntry}`);
    changed = true;
    console.log(`package-target: rewrote ${indexHtmlPath} to load spektrum from ${vendoredSpektrumEntry}`);
}

if (target === 'webos') {
    const shimAlreadyPresent = html.includes(shimScriptTag);
    if (shimAlreadyPresent) {
        console.log(`package-target: ${indexHtmlPath} already has the es-module-shims script tag`);
    } else if (checkOnly) {
        console.log(`package-target: --check — would inject "${shimScriptTag}" before the import map in ${indexHtmlPath}`);
    } else {
        const importMapTagMatch = html.match(importMapTagPattern);
        if (!importMapTagMatch) {
            console.error(`package-target: no <script type="importmap"> tag found in ${indexHtmlPath}`);
            process.exit(1);
        }
        html = html.replace(importMapTagPattern, `$1${shimScriptTag}$1$2`);
        changed = true;
        console.log(`package-target: injected the es-module-shims script tag before the import map in ${indexHtmlPath}`);
    }

    // LG App Self Checklist button/text-size overrides — a plain file copy
    // (not something Vite bundles, since the source index.html never
    // references it) plus a <link> injected after every other stylesheet so
    // its rules win the cascade on source order alone, no !important
    // needed. See src/styles/tv-mode.css's header comment.
    const tvModeCssTag = '<link rel="stylesheet" href="./tv-mode.css" />';
    const headCloseTagPattern = /(\s*)(<\/head>)/;
    if (checkOnly) {
        console.log(
            `package-target: --check — would copy tv-mode.css into ${distDir}/tv-mode.css and inject "${tvModeCssTag}" before </head> in ${indexHtmlPath}`,
        );
    } else {
        copyFileSync(`${repoRoot}src/styles/tv-mode.css`, `${distDir}/tv-mode.css`);
        if (html.includes(tvModeCssTag)) {
            console.log(`package-target: ${indexHtmlPath} already has the tv-mode.css <link> tag`);
        } else {
            const headCloseMatch = html.match(headCloseTagPattern);
            if (!headCloseMatch) {
                console.error(`package-target: no </head> tag found in ${indexHtmlPath}`);
                process.exit(1);
            }
            html = html.replace(headCloseTagPattern, `$1${tvModeCssTag}$1$2`);
            changed = true;
        }
        console.log(`package-target: copied tv-mode.css to ${distDir}/tv-mode.css and ensured its <link> tag is present`);
    }
}

if (changed) {
    writeFileSync(indexHtmlPath, html);
}
