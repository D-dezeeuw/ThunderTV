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

console.log(`check-csp: OK — strict script policy and ${String(expressions.length)} precompiled expressions verified`);
