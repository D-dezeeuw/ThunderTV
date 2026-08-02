#!/usr/bin/env node
/**
 * Fails when a module the Electron main process imports would be missing
 * from the packaged app.
 *
 * This is the cheap half of the desktop test story — no Electron binary, no
 * display, no packaging step, runs in `npm run verify` in milliseconds. The
 * expensive half is `scripts/smoke-desktop.mjs`, which really launches the
 * app; this exists because the bug it guards is deterministic, and waiting
 * for a 90-second packaged launch to discover a missing file is the wrong
 * trade.
 *
 * The failure mode it exists for: `desktop/` is `directories.app`, so
 * `main.mjs` sits at the root of `app.asar` and every relative import is
 * resolved from *there*, not from the repo. A specifier that is perfectly
 * valid in a checkout (`../scripts/proxy-server.mjs` — `desktop/` and
 * `scripts/` are siblings) points clean out of the package once built, and
 * the app dies at startup with `ERR_MODULE_NOT_FOUND` before it opens a
 * window. `npm start` from a checkout cannot reproduce it, which is exactly
 * why it shipped.
 *
 * The layout being modelled:
 *
 *   release/linux-unpacked/resources/     <- `extraResources:` land here
 *   ├── app.asar/                         <- `files:` land here; the app root
 *   │   ├── main.mjs                      <- `./x`  → app.asar/x
 *   │   └── dist/                         <- `../x` → resources/x
 *   └── scripts/proxy-server.mjs
 *
 * Usage: node scripts/check-desktop-package.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const desktopDir = path.join(repoRoot, 'desktop');
const configPath = path.join(repoRoot, 'electron-builder.yml');

const failures = [];

/**
 * Reads just the two sequence blocks this check needs out of
 * `electron-builder.yml`. Deliberately not a general YAML parser and
 * deliberately not a new dependency: it understands plain `- entry` scalars
 * and `- from:`/`to:` pairs, which is all this config has ever used, and it
 * refuses to guess at anything else rather than silently under-reporting
 * what gets packaged.
 */
function readFileSets(yaml, key) {
    const lines = yaml.split('\n');
    const start = lines.findIndex((l) => l === `${key}:`);
    if (start === -1) return [];

    const entries = [];
    let pending = null;
    for (const line of lines.slice(start + 1)) {
        // Any non-indented, non-blank, non-comment line ends the block.
        if (/^\S/.test(line)) break;
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const item = /^-\s*(.*)$/.exec(trimmed);
        if (item) {
            if (pending) entries.push(pending);
            pending = null;
            const value = item[1];
            if (!value) continue;
            const pair = /^(from|to):\s*(.+)$/.exec(value);
            if (pair) {
                pending = { [pair[1]]: pair[2].trim() };
                continue;
            }
            // A bare scalar: `- main.mjs`, or a `!negation` we ignore
            // (negations only ever subtract, so treating them as absent is
            // the safe direction for a check that asks "is this present?").
            const scalar = value.replace(/^['"]|['"]$/g, '');
            if (!scalar.startsWith('!')) entries.push({ from: scalar, to: scalar });
            continue;
        }

        const pair = /^(from|to):\s*(.+)$/.exec(trimmed);
        if (pair && pending) pending[pair[1]] = pair[2].trim();
    }
    if (pending) entries.push(pending);

    for (const entry of entries) {
        if (!entry.from) {
            failures.push(`electron-builder.yml: ${key} has an entry with no \`from\` — update this parser if the config grew a new shape.`);
        }
        entry.to ??= entry.from;
    }
    return entries;
}

/**
 * Every real file the packaged app will contain, keyed by its path relative
 * to `resources/` — the one coordinate system in which `app.asar/main.mjs`'s
 * `./x` and `../x` can both be checked.
 */
function buildPackagedLayout() {
    const yaml = readFileSync(configPath, 'utf8');
    const packaged = new Set();

    const add = (entries, prefix) => {
        for (const { from, to } of entries) {
            const source = path.resolve(desktopDir, from);
            if (!existsSync(source)) {
                // A `files:` glob for something not built yet (`../dist`
                // before `vite build`) is not this check's business.
                continue;
            }
            const target = path.posix.join(prefix, to);
            if (statSync(source).isDirectory()) {
                for (const child of walk(source)) {
                    packaged.add(path.posix.join(target, child));
                }
            } else {
                packaged.add(target);
            }
        }
    };

    // `files:` are placed inside the asar, which sits at `resources/app.asar`.
    add(readFileSets(yaml, 'files'), 'app.asar');
    // `extraResources:` are placed directly in `resources/`.
    add(readFileSets(yaml, 'extraResources'), '.');
    return packaged;
}

function* walk(dir, prefix = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) yield* walk(path.join(dir, entry.name), rel);
        else yield rel;
    }
}

/** Relative specifiers only — bare ones are `electron` or a node: builtin. */
const SPECIFIER_PATTERNS = [
    /(?:^|[\s;])import\s[^'"]*?from\s*['"](\.[^'"]+)['"]/g,
    /(?:^|[\s;])export\s[^'"]*?from\s*['"](\.[^'"]+)['"]/g,
    /(?:^|[\s;=(])import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
];

function relativeImportsOf(file) {
    const source = readFileSync(file, 'utf8');
    const found = new Set();
    for (const pattern of SPECIFIER_PATTERNS) {
        for (const match of source.matchAll(pattern)) found.add(match[1]);
    }
    return [...found];
}

/**
 * Walks the main process's module graph from its real entry points and
 * checks each hop against the packaged layout. Follows the graph rather
 * than checking `main.mjs` alone because the import chain has to travel
 * whole: `main.mjs` → `../scripts/proxy-server.mjs` →
 * `./cloudflare-cors-proxy.mjs` is two files, and packaging only the first
 * fails just as hard as packaging neither.
 */
function checkGraph(packaged) {
    const pkg = JSON.parse(readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
    // The entry points Electron itself loads: `main` from package.json, and
    // the preload, which `main.mjs` names as a path rather than an import.
    const entries = [path.join(desktopDir, pkg.main ?? 'main.mjs'), path.join(desktopDir, 'preload.cjs')];

    const seen = new Set();
    const queue = entries.filter((f) => {
        if (!existsSync(f)) failures.push(`desktop entry point is missing from the repo: ${path.relative(repoRoot, f)}`);
        return existsSync(f);
    });

    while (queue.length > 0) {
        const file = queue.shift();
        if (seen.has(file)) continue;
        seen.add(file);

        for (const specifier of relativeImportsOf(file)) {
            const resolved = path.resolve(path.dirname(file), specifier);
            if (!existsSync(resolved)) {
                failures.push(
                    `${path.relative(repoRoot, file)} imports "${specifier}", which does not exist at ${path.relative(repoRoot, resolved)}`,
                );
                continue;
            }

            // Where this file's importer lives inside the package, and
            // therefore where the specifier resolves to once packaged.
            const importerPackaged = packagedPathOf(file);
            if (!importerPackaged) continue; // already reported below
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(importerPackaged), specifier));

            if (!packaged.has(target)) {
                failures.push(
                    `${path.relative(repoRoot, file)} imports "${specifier}".\n` +
                        `      Packaged, that resolves to resources/${target} — which nothing in electron-builder.yml puts there.\n` +
                        `      The packaged app will die at startup with ERR_MODULE_NOT_FOUND.\n` +
                        `      Fix: add it under \`extraResources:\` (for a path outside desktop/) or \`files:\` (inside).`,
                );
            }
            queue.push(resolved);
        }
    }
}

/**
 * Where a repo file ends up inside `resources/`. `desktop/**` goes into the
 * asar; anything else must have been mapped in by `extraResources:`, which
 * this resolves by looking it up in the layout.
 */
let layoutIndex = null;
function packagedPathOf(file) {
    const relFromDesktop = path.relative(desktopDir, file);
    if (!relFromDesktop.startsWith('..')) {
        return path.posix.join('app.asar', relFromDesktop.split(path.sep).join('/'));
    }
    return layoutIndex?.get(path.resolve(file)) ?? null;
}

/** Reverse map: repo file → packaged path, for the extraResources hops. */
function buildLayoutIndex() {
    const yaml = readFileSync(configPath, 'utf8');
    const index = new Map();
    for (const { from, to } of readFileSets(yaml, 'extraResources')) {
        const source = path.resolve(desktopDir, from);
        if (existsSync(source) && statSync(source).isFile()) index.set(source, to);
    }
    return index;
}

const packaged = buildPackagedLayout();
layoutIndex = buildLayoutIndex();
checkGraph(packaged);

if (failures.length > 0) {
    console.error('check-desktop-package: the packaged Electron app would be broken:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(
        '\n  Verify the real thing with: cd desktop && npm run package:linux' +
            '\n                              node scripts/smoke-desktop.mjs --packaged release/linux-unpacked/thundertv-desktop\n',
    );
    process.exit(1);
}

console.log(`check-desktop-package: OK — every module desktop/ imports is present in the packaged layout`);
