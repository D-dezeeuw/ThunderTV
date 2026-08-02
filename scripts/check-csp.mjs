#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
    expectedGeneratedSource,
    extractExpressions,
    generatedPath,
    runtimeCacheCap,
} from './spektrum-csp.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(`${repoRoot}index.html`, 'utf8');
const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/s.exec(html)?.[1];
if (!policy) throw new Error('check-csp: index.html has no Content-Security-Policy meta tag');
if (policy.includes("'unsafe-eval'")) throw new Error("check-csp: script policy must not allow 'unsafe-eval'");

const scriptDirective = /(?:^|;\s*)script-src\s+([^;]+)/.exec(policy)?.[1] ?? '';
if (scriptDirective.includes("'unsafe-inline'")) {
    throw new Error("check-csp: script-src must not allow 'unsafe-inline'");
}

const importMapSource = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1];
if (!importMapSource) throw new Error('check-csp: import map is missing');
const importMapHash = createHash('sha256').update(importMapSource).digest('base64');
if (!scriptDirective.includes(`'sha256-${importMapHash}'`)) {
    throw new Error(`check-csp: script-src is missing the import-map hash sha256-${importMapHash}`);
}

const expected = expectedGeneratedSource();
const actual = readFileSync(generatedPath, 'utf8');
if (actual !== expected) {
    throw new Error('check-csp: generated expression registry is stale; run "npm run spektrum:csp"');
}

// Parsing this as a classic script is the critical regression check. Parsing
// the same `with` functions as ESM would throw before the app booted.
const context = vm.createContext({});
new vm.Script(actual, { filename: generatedPath }).runInContext(context);
const records = context.__THUNDERTV_CSP_EXPRESSIONS__;
const expressions = extractExpressions(html);
if (!Array.isArray(records) || records.length !== expressions.length) {
    throw new Error('check-csp: generated registry did not expose every source expression');
}
for (let i = 0; i < expressions.length; i += 1) {
    if (records[i]?.[0] !== expressions[i] || typeof records[i]?.[1] !== 'function') {
        throw new Error(`check-csp: generated registry drift at expression ${String(i)}`);
    }
}

// Everything above proves the registry is *generated* correctly. This last
// check asks the question that actually decides whether it works at
// runtime: can Spektrum still hold the entries once they are all in?
//
// `precompile()` writes into the same bounded LRU that expression lookup
// reads from, so a template with more expressions than the cap evicts its
// own earliest registrations before `bindDOM()` runs — and it cascades,
// since each subsequent miss inserts and evicts one more survivor. Every
// evicted expression falls back to `new Function(...)`, which the policy
// asserted above blocks. The symptom is not an error page: it is a fully
// rendered UI with every label blank, which is how it survived a packaging
// fix, a smoke test, and a full `npm run verify` before anyone caught it.
//
// `public/vendor/spektrum.runtime.js` exists to raise that cap (see
// scripts/spektrum-csp.mjs). This is the guard that the headroom is real.
const cacheCap = runtimeCacheCap();
if (cacheCap === null) {
    throw new Error(
        'check-csp: could not read the expression-cache cap out of the generated runtime; run "npm run spektrum:csp"',
    );
}
if (expressions.length > cacheCap) {
    throw new Error(
        `check-csp: ${String(expressions.length)} precompiled expressions exceeds the runtime's expression cache (${String(cacheCap)}).\n` +
            `  The first ${String(expressions.length - cacheCap)} would be evicted before bindDOM() runs and render as empty text.\n` +
            `  Raise RUNTIME_CACHE_CAP in scripts/spektrum-csp.mjs and re-run "npm run spektrum:csp".`,
    );
}

console.log(
    `check-csp: OK — strict script policy, ${String(expressions.length)} precompiled expressions, runtime cache cap ${String(cacheCap)}`,
);
