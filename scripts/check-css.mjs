#!/usr/bin/env node
// Two source-level CSS guards (Features 02.1.10 and 02.2.9). Kept as its
// own script rather than folded into check-dist.mjs (which validates built
// dist/ output) since these check authored src/ CSS instead:
//
//   1. No literal hex colors outside src/styles/tokens.css — every other
//      stylesheet must reference a color via var(--token), never a literal,
//      so tokens.css stays the single vocabulary.
//   2. No transition/animation/@keyframes anywhere under src/ — the
//      standing no-animation policy, enforced here as a second line of
//      defense alongside eslint's no-restricted-syntax (which only catches
//      TS string literals, not authored CSS).
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
const animationPattern = /\b(transition|animation)\s*:|@keyframes\b/;

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

    // The global kill-switch in base.css ("transition: none !important")
    // legitimately contains the word "transition" — allow exactly that
    // pattern, reject every other occurrence.
    const withoutKillSwitch = content
        .replace(/transition:\s*none\s*!important;?/g, '')
        .replace(/animation:\s*none\s*!important;?/g, '');
    if (animationPattern.test(withoutKillSwitch)) {
        console.error(
            `check-css: ${relPath} contains transition/animation/@keyframes — no-animation policy violation.`,
        );
        failed = true;
    }
}

if (failed) process.exit(1);

console.log(
    `check-css: OK — ${cssFiles.length} CSS file(s) clean (no literal hex colors outside tokens.css, no transitions/animations)`,
);
