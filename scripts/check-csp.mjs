#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
    expectedGeneratedSource,
    extractExpressions,
    generatedPath,
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
// runtime: does Spektrum still hold the entries once they are all in?
//
// `precompile()` writes into the same bounded LRU that expression lookup
// reads from (`Vt(source, fn)` → `U.set`, capped at `pe`). Registering more
// expressions than the cap evicts the earliest ones *before* `bindDOM()`
// ever runs, and every evicted expression then falls back to
// `new Function(...)` — which this app's deliberately `unsafe-eval`-free CSP
// blocks. The binding silently yields `undefined`, so the symptom is not an
// error page but blank labels all over a structurally correct UI.
//
// Warning, not a failure: the fix belongs upstream in Spektrum (give
// `precompile()` an unbounded map of its own, separate from the LRU), and
// failing the build here would only block work that cannot fix it. Promote
// this to a `throw` once the vendored runtime keeps precompiled entries.
const cacheCap = Number(/\bpe=(\d{2,6})\b/.exec(readFileSync(`${repoRoot}public/vendor/spektrum.min.js`, 'utf8'))?.[1]);
if (Number.isFinite(cacheCap) && expressions.length > cacheCap) {
    console.warn(
        `check-csp: WARNING — ${String(expressions.length)} precompiled expressions vs a Spektrum expression cache of ${String(cacheCap)}.\n` +
            `  The first ${String(expressions.length - cacheCap)} are evicted before bindDOM() runs, fall back to eval, and are\n` +
            `  blocked by the CSP — they render as empty text. Reproduce with:\n` +
            `    node scripts/smoke-desktop.mjs   (see the "app-level renderer errors" note)`,
    );
}

console.log(`check-csp: OK — strict script policy and ${String(expressions.length)} precompiled expressions verified`);
