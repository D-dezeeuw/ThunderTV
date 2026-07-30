#!/usr/bin/env node
// Assembles a webOS app staging directory and packages it into an .ipk via
// LG's `ares-package` CLI. Run after `vite build --mode webos` and
// `scripts/package-target.mjs webos` (see `npm run build:lg`).
//
// `ares-package` (npm: @webos-tools/cli) is treated as an external tool,
// not a project devDependency — it's a ~90 MB SDK-style package, and
// desktop/'s Electron tooling is isolated the same way (its own
// package.json, never the root). Install instructions: webos/README.md.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = `${repoRoot}dist-webos`;
const webosDir = `${repoRoot}webos`;
const releaseDir = `${repoRoot}release`;
const stagingDir = `${releaseDir}/webos-staging`;

const pkg = JSON.parse(readFileSync(`${repoRoot}package.json`, 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(
        `package-webos: package.json version "${version}" is not strictly 3-part numeric — ` +
            `webOS's appinfo.json requires a plain "x.y.z" version with no prerelease/build suffix.`,
    );
    process.exit(1);
}

if (!existsSync(`${distDir}/index.html`)) {
    console.error(`package-webos: ${distDir}/index.html not found — run "vite build --mode webos" first.`);
    process.exit(1);
}

try {
    execFileSync('ares-package', ['--version'], { stdio: 'ignore' });
} catch {
    console.error(
        'package-webos: "ares-package" not found on PATH. Install LG\'s webOS TV CLI ' +
            '("npm install -g @webos-tools/cli") — see webos/README.md.',
    );
    process.exit(1);
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
cpSync(distDir, stagingDir, { recursive: true });

const appinfo = JSON.parse(readFileSync(`${webosDir}/appinfo.json`, 'utf8'));
appinfo.version = version;
writeFileSync(`${stagingDir}/appinfo.json`, `${JSON.stringify(appinfo, null, 4)}\n`);

copyFileSync(`${webosDir}/icon.png`, `${stagingDir}/icon.png`);
copyFileSync(`${webosDir}/largeIcon.png`, `${stagingDir}/largeIcon.png`);

console.log(`package-webos: staged ${stagingDir}, running ares-package...`);
// `--no-minify`: ares-package's own bundled terser pass is redundant (Vite
// already minifies dist-webos/) and chokes on some of Rollup's output —
// confirmed against ares-cli 3.2.5 ("Failed to minify code" on a chunk
// containing nothing unusual). Undocumented in `ares-package --help` but
// present in its option parser (bin/ares-package.js's `knownOpts`).
execFileSync('ares-package', [stagingDir, '-o', releaseDir, '--no-minify'], { stdio: 'inherit', cwd: repoRoot });

const expectedIpk = `${releaseDir}/${appinfo.id}_${version}_all.ipk`;
const finalIpk = `${releaseDir}/thundertv-${version}-webos.ipk`;
if (!existsSync(expectedIpk)) {
    console.error(
        `package-webos: expected ares-package to produce "${expectedIpk}" but it wasn't found — ` +
            'check the ares-package output above for its actual filename.',
    );
    process.exit(1);
}
renameSync(expectedIpk, finalIpk);
console.log(`package-webos: wrote ${finalIpk}`);
