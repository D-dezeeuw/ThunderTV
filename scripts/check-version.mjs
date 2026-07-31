#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = (relative) => JSON.parse(readFileSync(`${root}${relative}`, 'utf8'));
const expected = readJson('package.json').version;
const versions = [
    ['package-lock.json', readJson('package-lock.json').version],
    ['desktop/package.json', readJson('desktop/package.json').version],
    ['desktop/package-lock.json', readJson('desktop/package-lock.json').version],
    ['webos/appinfo.json', readJson('webos/appinfo.json').version],
];
const sourceChecks = [
    ['desktop/preload.cjs', readFileSync(`${root}desktop/preload.cjs`, 'utf8')],
    ['src/state/settings-export.actions.ts', readFileSync(`${root}src/state/settings-export.actions.ts`, 'utf8')],
];
const failures = versions.filter(([, version]) => version !== expected).map(([file, version]) => `${file}: ${version}`);
for (const [file, source] of sourceChecks) {
    if (!source.includes(`'${expected}'`)) failures.push(`${file}: missing ${expected}`);
}
if (failures.length > 0) {
    console.error(`check-version: expected ${expected}\n${failures.map((line) => `  ${line}`).join('\n')}`);
    process.exit(1);
}
console.log(`check-version: OK — ${expected} is synchronized across web, desktop, webOS, and exports`);
