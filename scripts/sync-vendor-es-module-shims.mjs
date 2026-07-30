#!/usr/bin/env node
// Re-downloads the pinned es-module-shims build, verifies it against
// scripts/es-module-shims-version.json, and writes
// public/vendor/es-module-shims.js. This is the ONLY sanctioned way to
// update the vendored copy — mirrors scripts/sync-vendor-spektrum.mjs.
//
// es-module-shims polyfills import-map support for the webOS build
// (Chromium <89 has no native import maps) — see scripts/package-target.mjs,
// which injects a <script> tag pointing at the vendored file below.
//
// To bump the pinned version: edit scripts/es-module-shims-version.json's
// "version" and "cdnUrl" fields together, then re-run this script to fetch
// the new file and recompute+store its sha384.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const versionJsonPath = `${repoRoot}scripts/es-module-shims-version.json`;
const version = JSON.parse(readFileSync(versionJsonPath, 'utf8'));

if (!/^https:\/\/unpkg\.com\/es-module-shims@\d+\.\d+\.\d+\/dist\/es-module-shims\.js$/.test(version.cdnUrl)) {
    console.error(
        `sync-vendor-es-module-shims: refusing to fetch "${version.cdnUrl}" — not an exact-pinned ` +
            `unpkg URL (no @latest, no semver range).`,
    );
    process.exit(1);
}

console.log(`sync-vendor-es-module-shims: fetching ${version.cdnUrl}`);
const res = await fetch(version.cdnUrl);
if (!res.ok) {
    console.error(`sync-vendor-es-module-shims: fetch failed with HTTP ${res.status}`);
    process.exit(1);
}
const bytes = new Uint8Array(await res.arrayBuffer());

const sha384 = createHash('sha384').update(bytes).digest('base64');
const vendoredPath = `${repoRoot}${version.vendoredPath}`;
writeFileSync(vendoredPath, bytes);
console.log(`sync-vendor-es-module-shims: wrote ${version.vendoredPath} (${bytes.length} bytes)`);

if (sha384 !== version.sha384) {
    console.log(
        `sync-vendor-es-module-shims: sha384 changed (${version.sha384} -> ${sha384}) — ` +
            `updating scripts/es-module-shims-version.json.`,
    );
    version.sha384 = sha384;
    writeFileSync(versionJsonPath, `${JSON.stringify(version, null, 2)}\n`);
} else {
    console.log('sync-vendor-es-module-shims: sha384 unchanged, vendored file already up to date.');
}
