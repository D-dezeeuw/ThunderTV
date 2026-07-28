#!/usr/bin/env node
// Fails when a feature is built but unreachable — the defect AUDIT.md §3.1
// describes, where Movies/Series/Search shipped 3,430 fully-tested lines that
// no user could click, with CI green throughout.
//
// Two directions, both of which were silently broken at some point:
//   1. A `defineFn('x/y', …)` registration with no `data-fn="x/y"` in the
//      markup — code that can never run. Allowed only via an explicit entry
//      in scripts/reachability-allowlist.json, so "intentionally unbound" is
//      a reviewed, one-line act rather than a silent default.
//   2. A `data-fn="x/y"` in the markup with no registration — a dead click.
//
// Same source-text-parsing convention as check-css.mjs / check-importmap.mjs:
// these modules import `spektrum` from a bare specifier that only resolves
// through a browser import map or the Vitest alias, never plain Node.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = `${repoRoot}src`;
const indexHtmlPath = `${repoRoot}index.html`;
const allowlistPath = `${repoRoot}scripts/reachability-allowlist.json`;

/** Every *.ts under src/, excluding specs and benches (test-only registrations are not shipped behaviour). */
function sourceFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) {
            out.push(...sourceFiles(full));
        } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.bench.ts')) {
            out.push(full);
        }
    }
    return out;
}

const registered = new Map(); // name -> repo-relative file it is registered in
for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/defineFn\(\s*'([^']+)'/g)) {
        registered.set(match[1], file.slice(repoRoot.length));
    }
}

const html = readFileSync(indexHtmlPath, 'utf8');
const bound = new Set([...html.matchAll(/data-fn="([^"]+)"/g)].map((m) => m[1]));

let allowlist = {};
try {
    allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
} catch {
    console.error(`check-reachability: cannot read ${allowlistPath.slice(repoRoot.length)} — it must exist (use {} for an empty allowlist).`);
    process.exit(1);
}
const allowed = new Set(Object.keys(allowlist).filter((k) => !k.startsWith('$')));

const errors = [];

const unreachable = [...registered.keys()].filter((name) => !bound.has(name) && !allowed.has(name)).sort();
for (const name of unreachable) {
    errors.push(
        `unreachable action '${name}' (registered in ${registered.get(name)}) — no data-fn="${name}" in index.html.\n` +
            `    Bind it in the markup, delete it, or add it to scripts/reachability-allowlist.json with a reason if it is called programmatically.`,
    );
}

const deadClicks = [...bound].filter((name) => !registered.has(name)).sort();
for (const name of deadClicks) {
    errors.push(`dead click: index.html binds data-fn="${name}" but nothing calls defineFn('${name}', …) — clicking it does nothing.`);
}

// A stale allowlist entry is its own kind of rot: it silently keeps granting
// an exemption for an action that no longer exists, or that has since been
// bound properly and no longer needs one.
for (const name of allowed) {
    if (!registered.has(name)) {
        errors.push(`stale allowlist entry '${name}' — no defineFn('${name}', …) exists. Remove it from scripts/reachability-allowlist.json.`);
    } else if (bound.has(name)) {
        errors.push(`redundant allowlist entry '${name}' — it is bound in index.html now, so the exemption is no longer needed. Remove it.`);
    }
}

// Routes are the same class of defect one level up: the original §3.1 finding
// was a `Route` union with no 'movies'/'series' member while the state layer
// was fully built for both.
const routerSource = readFileSync(`${srcDir}/app/router.ts`, 'utf8');
const routeUnion = routerSource.match(/export type Route =([\s\S]*?);/);
if (routeUnion) {
    const routes = [...routeUnion[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const views = new Set([...html.matchAll(/data-view="([^"]+)"/g)].map((m) => m[1]));
    for (const view of views) {
        if (!routes.includes(view)) {
            errors.push(`index.html has data-view="${view}" but '${view}' is not in router.ts's Route union — navigating there falls back to the default route.`);
        }
    }
}

if (errors.length > 0) {
    console.error('check-reachability: FAILED\n');
    for (const e of errors) console.error(`  • ${e}`);
    console.error(`\n${String(errors.length)} problem(s). ${String(registered.size)} actions registered, ${String(bound.size)} bound in markup.`);
    process.exit(1);
}

console.log(
    `check-reachability: OK — ${String(registered.size)} actions registered, ${String(bound.size)} bound, ${String(allowed.size)} allowlisted, 0 dead clicks.`,
);
