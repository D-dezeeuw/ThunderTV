#!/usr/bin/env node
/**
 * ThunderTV's strict-CSP bridge for Spektrum 1.1.
 *
 * Spektrum's published compiler emits `with (state)` inside an ES module.
 * ES modules are always strict mode, where `with` is a syntax error. This
 * generator keeps the same runtime semantics but emits a normal, external
 * classic script. The functions are parsed as source by the browser (which
 * CSP permits); there is no eval/new Function at runtime.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const generatedPath = `${repoRoot}public/vendor/spektrum-precompiled.js`;

/**
 * The runtime the app actually loads: the pinned Spektrum build with its
 * expression-cache cap raised. Generated, never hand-written — see
 * `expectedRuntimeSource()` for why it has to exist at all.
 */
export const runtimePath = `${repoRoot}public/vendor/spektrum.runtime.js`;
/**
 * The pinned upstream bytes — a build *input*, so it lives at the repo root
 * rather than in `public/`, where it would be copied into every dist/ that
 * never fetches it. Keep in step with `spektrum-version.json`'s
 * `vendoredPath`; see `vendor/README.md`.
 */
const vendoredPath = `${repoRoot}vendor/spektrum.min.js`;
const versionPath = `${repoRoot}scripts/spektrum-version.json`;

/**
 * Registering an expression and looking one up share a single bounded LRU
 * in Spektrum 1.1.0:
 *
 *   Vt = (o, a) => { U.size >= pe && U.delete(U.keys().next().value), U.set(o, a) }
 *   rt = o => { let a = U.get(o); if (a) return a; … new Function(…) … }
 *
 * `precompile()` is `Vt`. So registering more expressions than `pe` evicts
 * the earliest ones before `bindDOM()` ever runs — and it cascades, because
 * every subsequent miss inserts too, evicting one more survivor each time.
 * With 724 expressions against a cap of 500, essentially the whole template
 * ends up falling back to `new Function(…)`, which this app's
 * `unsafe-eval`-free CSP blocks. The visible result is a structurally
 * correct UI with every label blank.
 *
 * There is no exported knob for the cap and no newer Spektrum (1.1.0 is
 * latest), so the cap is raised here instead. The upstream fix is to give
 * `precompile()` an unbounded map of its own, separate from the lookup LRU;
 * when that ships, delete this transform and point the import map back at
 * `spektrum.min.js`.
 *
 * Two properties make patching minified code safe rather than reckless:
 * the input bytes are pinned by SHA-384 (verified below, so this can never
 * silently apply to a different build), and the cap identifier is *derived*
 * from the writer expression rather than hard-coded, so a re-minify that
 * renames `pe` is a clean failure rather than a silent no-op.
 */
const RUNTIME_CACHE_CAP = 5000;

/** Matches the LRU writer and captures the identifiers for the cache and its cap. */
const CACHE_WRITER = /([A-Za-z_$][\w$]*)=\((\w+),(\w+)\)=>\{([A-Za-z_$][\w$]*)\.size>=([A-Za-z_$][\w$]*)&&\4\.delete\(\4\.keys\(\)\.next\(\)\.value\),\4\.set\(\2,\3\)\}/;

export function expectedRuntimeSource() {
    const source = readFileSync(vendoredPath, 'utf8');

    const { sha384 } = JSON.parse(readFileSync(versionPath, 'utf8'));
    const actual = createHash('sha384').update(readFileSync(vendoredPath)).digest('base64');
    if (actual !== sha384) {
        throw new Error(
            `spektrum-csp: ${vendoredPath} does not match the pinned SHA-384 — refusing to patch bytes ` +
                `this transform was not written against. Run scripts/sync-vendor-spektrum.mjs.`,
        );
    }

    const writer = CACHE_WRITER.exec(source);
    if (!writer) {
        throw new Error(
            'spektrum-csp: could not find Spektrum\'s expression-cache writer. The vendored build was ' +
                'reshaped — re-derive the transform (or drop it, if precompile() no longer shares the LRU).',
        );
    }
    const capName = writer[5];

    // Replace only the cap's own declaration, and only when it is the
    // literal 500 this was written against — anything else means the
    // assumption moved and a silent patch would be worse than a failure.
    const declaration = new RegExp(`(^|[,;{(])${capName}=500(?=[,;)])`);
    if (!declaration.test(source)) {
        throw new Error(
            `spektrum-csp: found the cache writer but not a "${capName}=500" declaration to raise.`,
        );
    }
    const patched = source.replace(declaration, `$1${capName}=${String(RUNTIME_CACHE_CAP)}`);

    return `${patched}\n/* Patched by scripts/spektrum-csp.mjs: expression-cache cap ${capName} 500 -> ${String(RUNTIME_CACHE_CAP)}. Do not edit. */\n`;
}

/** The cap the generated runtime actually ships with, read back from the file. */
export function runtimeCacheCap() {
    const writer = CACHE_WRITER.exec(readFileSync(runtimePath, 'utf8'));
    if (!writer) return null;
    const cap = new RegExp(`[,;{(]${writer[5]}=(\\d+)[,;)]`).exec(readFileSync(runtimePath, 'utf8'));
    return cap ? Number(cap[1]) : null;
}

const MUSTACHE = /\{\{\s*([^}]+?)\s*\}\}/g;
const ATTR_BIND = /(?:\s|^)(:[\w-]+|data-if|data-key)\s*=\s*(["'])(.*?)\2/gs;

/** Keep this scanner in lockstep with the four expression forms Spektrum binds. */
export function extractExpressions(html) {
    // Spektrum walks DOM text nodes and attributes, not HTML comments.
    const template = html.replace(/<!--[\s\S]*?-->/g, '');
    const seen = new Set();
    for (const match of template.matchAll(MUSTACHE)) {
        const value = match[1].trim();
        if (value) seen.add(value);
    }
    for (const match of template.matchAll(ATTR_BIND)) {
        const value = match[3].trim();
        if (value) seen.add(value);
    }
    return [...seen];
}

function normalizeNumericPaths(source) {
    return source.replace(
        /([a-zA-Z_$][\w$]*)((?:\.\d+)+)/g,
        (_match, head, tail) => head + tail.replace(/\.(\d+)/g, '[$1]'),
    );
}

/**
 * Every record repeats the same wrapper, so its identifiers are one letter
 * and the catch body is empty (`return` and `return void 0` are the same
 * value). At ~750 expressions that is ~21 KB less to *parse*, which is the
 * pressure `scripts/check-dist.mjs`'s raw eager budget exists to bound on a
 * Chromium 87 TV — gzip barely notices repeated text, a parser does.
 *
 * The wrapper cannot be hoisted into a shared factory: building one function
 * per expression from a string is exactly the `new Function`/`eval` that
 * precompiling exists to avoid under CSP. Each body has to be a literal.
 */
export function emitClassicPrecompileSource(expressions) {
    const records = expressions.map((source) => {
        const normalized = normalizeNumericPaths(source);
        return `[${JSON.stringify(source)},function(s,c){try{with(s)with(c||{})return(${normalized})}catch{}}]`;
    });

    return [
        '/* Generated by scripts/spektrum-csp.mjs. Do not edit. */',
        '(function(g){',
        `const records=[${records.join(',')}];`,
        "Object.defineProperty(g,'__THUNDERTV_CSP_EXPRESSIONS__',{value:records,configurable:true});",
        '})(globalThis);',
        '',
    ].join('\n');
}

export function expectedGeneratedSource() {
    const html = readFileSync(`${repoRoot}index.html`, 'utf8');
    return emitClassicPrecompileSource(extractExpressions(html));
}

/** Both generated artifacts, so neither can go stale without the other noticing. */
function outputs() {
    return [
        { path: generatedPath, expected: expectedGeneratedSource(), label: 'expression registry' },
        { path: runtimePath, expected: expectedRuntimeSource(), label: 'patched runtime' },
    ];
}

function main() {
    const checkOnly = process.argv.includes('--check');
    const stale = [];

    for (const { path, expected, label } of outputs()) {
        let actual = '';
        try {
            actual = readFileSync(path, 'utf8');
        } catch {
            // Missing output is handled by check/write below.
        }
        if (actual === expected) continue;
        if (checkOnly) {
            stale.push(label);
            continue;
        }
        writeFileSync(path, expected);
        console.log(`spektrum-csp: wrote ${path}`);
    }

    const expressionCount = extractExpressions(readFileSync(`${repoRoot}index.html`, 'utf8')).length;

    if (checkOnly) {
        if (stale.length > 0) {
            console.error(
                `spektrum-csp: generated ${stale.join(' and ')} missing or stale; run "npm run spektrum:csp"`,
            );
            process.exit(1);
        }
        console.log(
            `spektrum-csp: OK — ${String(expressionCount)} expressions precompiled, runtime cache cap ${String(runtimeCacheCap())}`,
        );
        return;
    }

    console.log(`spektrum-csp: current — ${String(expressionCount)} expressions, cache cap ${String(runtimeCacheCap())}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
