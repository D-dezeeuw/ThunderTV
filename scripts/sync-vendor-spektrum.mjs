#!/usr/bin/env node
// Re-downloads the pinned Spektrum build, verifies it against
// scripts/spektrum-version.json, and writes public/vendor/spektrum.min.js.
// This is the ONLY sanctioned way to update the vendored copy — hand-editing
// the vendored file or the hash separately will fail check-importmap.mjs and
// this script's own verification pass.
//
// To bump the pinned version: edit scripts/spektrum-version.json's "version"
// and "cdnUrl" fields AND index.html's import map together, then re-run this
// script to fetch the new file and recompute+store its sha384.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const versionJsonPath = `${repoRoot}scripts/spektrum-version.json`;
const version = JSON.parse(readFileSync(versionJsonPath, 'utf8'));

if (!/^https:\/\/unpkg\.com\/spektrum@\d+\.\d+\.\d+\/spektrum\.min\.js$/.test(version.cdnUrl)) {
    console.error(
        `sync-vendor-spektrum: refusing to fetch "${version.cdnUrl}" — not an exact-pinned ` +
            `unpkg URL (no @latest, no semver range).`,
    );
    process.exit(1);
}

console.log(`sync-vendor-spektrum: fetching ${version.cdnUrl}`);
const res = await fetch(version.cdnUrl);
if (!res.ok) {
    console.error(`sync-vendor-spektrum: fetch failed with HTTP ${res.status}`);
    process.exit(1);
}
const bytes = new Uint8Array(await res.arrayBuffer());

const sha384 = createHash('sha384').update(bytes).digest('base64');
const vendoredPath = `${repoRoot}${version.vendoredPath}`;
writeFileSync(vendoredPath, bytes);
console.log(`sync-vendor-spektrum: wrote ${version.vendoredPath} (${bytes.length} bytes)`);

if (sha384 !== version.sha384) {
    console.log(
        `sync-vendor-spektrum: sha384 changed (${version.sha384} -> ${sha384}) — ` +
            `updating scripts/spektrum-version.json.`,
    );
    version.sha384 = sha384;
    writeFileSync(versionJsonPath, `${JSON.stringify(version, null, 2)}\n`);
} else {
    console.log('sync-vendor-spektrum: sha384 unchanged, vendored file already up to date.');
}
