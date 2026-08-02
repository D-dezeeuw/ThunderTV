// @vitest-environment node
/**
 * The one genuinely tricky thing in `check-desktop-package.mjs` is the
 * coordinate translation: a specifier is resolved relative to where its
 * importer sits *in the package*, not in the repo, and those two differ by
 * exactly one directory level for `desktop/**`. Getting that off by one in
 * either direction makes the check either useless (passes the bug) or
 * unusable (fails a correct config), so it is what these cases pin.
 *
 * Everything else the script does — reading the config, walking the graph —
 * is exercised end-to-end by running it, which `npm run verify` does.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const scriptSource = path.join(repoRoot, 'scripts', 'check-desktop-package.mjs');

let sandbox: string | null = null;

/**
 * A miniature repo with the same shape as the real one — `desktop/` beside
 * `scripts/`, the script at `scripts/check-desktop-package.mjs` so its
 * `new URL('..')` root resolution lands in the sandbox.
 */
function makeRepo(config: string, mainSource: string): string {
    sandbox = mkdtempSync(path.join(os.tmpdir(), 'desktop-pkg-'));
    mkdirSync(path.join(sandbox, 'desktop'));
    mkdirSync(path.join(sandbox, 'scripts'));
    writeFileSync(path.join(sandbox, 'electron-builder.yml'), config);
    writeFileSync(path.join(sandbox, 'desktop', 'main.mjs'), mainSource);
    writeFileSync(path.join(sandbox, 'desktop', 'preload.cjs'), '');
    writeFileSync(path.join(sandbox, 'desktop', 'package.json'), JSON.stringify({ main: 'main.mjs' }));
    writeFileSync(path.join(sandbox, 'scripts', 'proxy-server.mjs'), 'export const createProxyServer = () => {};');
    cpSync(scriptSource, path.join(sandbox, 'scripts', 'check-desktop-package.mjs'));
    return sandbox;
}

function run(dir: string): { code: number; output: string } {
    try {
        const output = execFileSync(process.execPath, [path.join(dir, 'scripts', 'check-desktop-package.mjs')], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: 0, output };
    } catch (err) {
        const e = err as { status: number; stdout: string; stderr: string };
        return { code: e.status, output: `${e.stdout}${e.stderr}` };
    }
}

const FILES_ONLY = `files:\n  - main.mjs\n  - preload.cjs\n  - package.json\n`;
const WITH_EXTRA_RESOURCES = `${FILES_ONLY}extraResources:\n  - from: ../scripts/proxy-server.mjs\n    to: scripts/proxy-server.mjs\n`;

afterEach(() => {
    if (sandbox) rmSync(sandbox, { recursive: true, force: true });
    sandbox = null;
});

describe('check-desktop-package', () => {
    it('fails when an import escapes the package, even though the file exists in the repo', () => {
        // The shipped bug: `desktop/` and `scripts/` are siblings, so this
        // specifier resolves fine from a checkout and not at all from
        // inside app.asar.
        const dir = makeRepo(FILES_ONLY, `import { createProxyServer } from '../scripts/proxy-server.mjs';\n`);
        const { code, output } = run(dir);
        expect(code).toBe(1);
        expect(output).toContain('resources/scripts/proxy-server.mjs');
        expect(output).toContain('ERR_MODULE_NOT_FOUND');
    });

    it('passes once extraResources puts the file where ../ resolves to', () => {
        const dir = makeRepo(WITH_EXTRA_RESOURCES, `import { createProxyServer } from '../scripts/proxy-server.mjs';\n`);
        expect(run(dir).code).toBe(0);
    });

    it('accepts a sibling import inside desktop/, which never leaves the asar', () => {
        const dir = makeRepo(
            `files:\n  - main.mjs\n  - downloads.mjs\n  - preload.cjs\n  - package.json\n`,
            `import { registerDownloadHandlers } from './downloads.mjs';\n`,
        );
        writeFileSync(path.join(dir, 'desktop', 'downloads.mjs'), 'export const registerDownloadHandlers = () => {};');
        expect(run(dir).code).toBe(0);
    });

    it('fails a desktop/ sibling that exists but was left out of the files allowlist', () => {
        // Default-deny means forgetting to list a new `desktop/*.mjs` is a
        // runtime-only failure in a distributed build — the same class of
        // bug, one directory in.
        const dir = makeRepo(FILES_ONLY, `import { registerDownloadHandlers } from './downloads.mjs';\n`);
        writeFileSync(path.join(dir, 'desktop', 'downloads.mjs'), 'export const registerDownloadHandlers = () => {};');
        const { code, output } = run(dir);
        expect(code).toBe(1);
        expect(output).toContain('app.asar/downloads.mjs');
    });

    it('follows the graph past the first hop', () => {
        // Packaging `proxy-server.mjs` but not what it imports fails just as
        // hard as packaging neither.
        const dir = makeRepo(WITH_EXTRA_RESOURCES, `import { createProxyServer } from '../scripts/proxy-server.mjs';\n`);
        writeFileSync(
            path.join(dir, 'scripts', 'proxy-server.mjs'),
            `import worker from './cloudflare-cors-proxy.mjs';\nexport const createProxyServer = () => worker;\n`,
        );
        writeFileSync(path.join(dir, 'scripts', 'cloudflare-cors-proxy.mjs'), 'export default {};');
        const { code, output } = run(dir);
        expect(code).toBe(1);
        expect(output).toContain('cloudflare-cors-proxy.mjs');
    });
});
