#!/usr/bin/env node
// Rewrites built bare Spektrum imports to the pinned local file and removes
// the import map. This lets Electron/webOS load without a network dependency
// or an import-map shim (Chromium 87 has native ESM, just not import maps).
// webOS additionally gets src/styles/tv-mode.css's LG-App-Self-Checklist
// overrides. Run after `vite build`, before packaging.
//
// Usage:
//   node scripts/package-target.mjs <electron|webos> [--dist <path>] [--check]
//
// --check   dry-run: report what would change, change nothing.
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const importMapTagPattern = /\s*<script type="importmap">[\s\S]*?<\/script>/;
const assetsDir = `${distDir}/assets`;

let html = readFileSync(indexHtmlPath, 'utf8');
let changed = false;

let rewrittenImports = 0;
for (const name of readdirSync(assetsDir).filter((entry) => entry.endsWith('.js'))) {
    const assetPath = `${assetsDir}/${name}`;
    const source = readFileSync(assetPath, 'utf8');
    const output = source.replace(/(["'])spektrum\1/g, (_match, quote) => {
        rewrittenImports += 1;
        // The generated runtime, matching index.html's import map — the
        // packaged targets must load the same patched build the web one
        // does, or they get the CSP-blocked-eval blank UI back.
        return `${quote}../vendor/spektrum.runtime.js${quote}`;
    });
    if (!checkOnly && output !== source) writeFileSync(assetPath, output);
}

const hasImportMap = importMapTagPattern.test(html);
if (rewrittenImports === 0 && hasImportMap) {
    console.error(`package-target: no bare Spektrum imports found under ${assetsDir}`);
    process.exit(1);
}
if (rewrittenImports > 0) {
    console.log(
        `package-target: ${checkOnly ? '--check — would rewrite' : 'rewrote'} ${String(rewrittenImports)} Spektrum import(s) to the local runtime`,
    );
}
if (hasImportMap) {
    if (checkOnly) {
        console.log(`package-target: --check — would remove the import map from ${indexHtmlPath}`);
    } else {
        html = html.replace(importMapTagPattern, '');
        changed = true;
        console.log(`package-target: removed the now-unneeded import map from ${indexHtmlPath}`);
    }
} else if (rewrittenImports === 0) {
    console.log(`package-target: ${distDir} is already transformed`);
}

if (target === 'webos') {
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
