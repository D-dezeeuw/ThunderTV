#!/usr/bin/env node
// Feature 07.2.10: the FileReader half of Feature 03.7.8's fence — the
// dynamic <input type=file> half is already an ESLint no-restricted-syntax
// rule (AST-level, more robust than grep), but FileReader has no equivalent
// rule, so this grep-based script covers it. File reading goes through
// `WebFileAdapter.readText()` (File.text(), not FileReader) everywhere in
// this codebase, so today's assertion is "stays that way", not "already
// broken and ignored".
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = `${repoRoot}src`;
const allowedDir = `${srcDir}/core/platform`;

function listTsFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
        else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full);
    }
    return out;
}

let failed = false;
for (const file of listTsFiles(srcDir)) {
    if (file.startsWith(allowedDir)) continue;
    const content = readFileSync(file, 'utf8');
    if (/\bnew FileReader\b/.test(content)) {
        console.error(
            `check-file-access-fence: ${file.replace(repoRoot, '')} uses FileReader — file access belongs in src/core/platform/ (Feature 07.2.10).`,
        );
        failed = true;
    }
}

if (failed) process.exit(1);

console.log('check-file-access-fence: OK — no FileReader usage outside src/core/platform/');
