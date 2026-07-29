#!/usr/bin/env node
// Source-level CSS guard (Feature 02.1.10): no literal hex colors outside
// src/styles/tokens.css — every other stylesheet must reference a color
// via var(--token), never a literal, so tokens.css stays the single
// vocabulary and the light/dark themes stay a one-file concern.
//
// The former companion guard (no transition/animation/@keyframes — the
// original no-animation policy) was retired with the theme refresh:
// motion is part of the design language now, gated by
// prefers-reduced-motion in base.css rather than banned.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = `${repoRoot}src`;

function listCssFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) out.push(...listCssFiles(full));
        else if (entry.endsWith('.css')) out.push(full);
    }
    return out;
}

const cssFiles = listCssFiles(srcDir);
const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;

let failed = false;

for (const file of cssFiles) {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(repoRoot, '');

    if (!file.endsWith('tokens.css')) {
        const hexMatches = content.match(hexPattern);
        if (hexMatches) {
            console.error(
                `check-css: ${relPath} has literal hex color(s): ${hexMatches.join(', ')}`,
            );
            console.error('  Use a var(--color-*) token from tokens.css instead.');
            failed = true;
        }
    }
}

if (failed) process.exit(1);

console.log(`check-css: OK — ${cssFiles.length} CSS file(s) clean (no literal hex colors outside tokens.css)`);
