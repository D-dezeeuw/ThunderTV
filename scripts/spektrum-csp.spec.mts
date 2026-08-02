// @vitest-environment node
//
// The one thing worth testing in the generated CSP registry: that the shared
// path walker means *exactly* what the literal `with(s)with(c||{})` wrapper it
// replaced meant. 543 of the template's 768 expressions now go through it, and
// the failure mode is not an exception — it is a fully rendered UI with blank
// labels, which is how the last cache-eviction bug survived a full `verify`.
//
// So the reference here is the wrapper itself, built with `new Function`
// (fine in Node; the whole point of the generator is that the *browser* never
// does this) and compared output-for-output.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { emitClassicPrecompileSource, extractExpressions, normalizeNumericPaths } from './spektrum-csp.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

type Fn = (state: unknown, scope?: unknown) => unknown;

/** Runs the generated classic script and hands back its `[source, fn]` records. */
function compile(expressions: string[]): Map<string, Fn> {
    const context: Record<string, unknown> = {};
    vm.createContext(context);
    new vm.Script(emitClassicPrecompileSource(expressions)).runInContext(context);
    const records = context.__THUNDERTV_CSP_EXPRESSIONS__ as [string, Fn][];
    expect(records.map(([source]) => source)).toEqual(expressions);
    return new Map(records);
}

/** What the registry used to emit, one literal wrapper per expression. */
function reference(source: string): Fn {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function('s', 'c', `try{with(s)with(c||{})return(${normalizeNumericPaths(source)})}catch{}`) as Fn;
}

/** Nests `value` at `path` inside a fresh object: 'a.b.c' -> { a: { b: { c } } }. */
function nest(path: string, value: unknown): Record<string, unknown> {
    const segments = path.split('.');
    const root: Record<string, unknown> = {};
    let node = root;
    for (const segment of segments.slice(0, -1)) {
        node[segment] ??= {};
        node = node[segment] as Record<string, unknown>;
    }
    node[segments[segments.length - 1]!] = value;
    return root;
}

function merge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    for (const [key, value] of Object.entries(source)) {
        if (value !== null && typeof value === 'object' && typeof target[key] === 'object' && target[key] !== null) {
            merge(target[key] as Record<string, unknown>, value as Record<string, unknown>);
        } else {
            target[key] = value;
        }
    }
    return target;
}

describe('the generated registry’s shared path walker', () => {
    const PLAIN = /^!?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$0-9][\w$]*)*$/;
    const realPaths = extractExpressions(readFileSync(`${repoRoot}index.html`, 'utf8')).filter((expression) =>
        PLAIN.test(expression),
    );

    it('covers most of the real template, so this is not a toy sample', () => {
        expect(realPaths.length).toBeGreaterThan(400);
    });

    it('agrees with the with-wrapper on every real path expression, resolved and unresolved', () => {
        const walkers = compile(realPaths);
        // One state where every path resolves to its own text, and one where
        // none of them do — the two halves of what a binding sees during boot.
        const populated = realPaths.reduce<Record<string, unknown>>(
            (state, expression) => merge(state, nest(expression.replace(/^!/, ''), `value:${expression}`)),
            {},
        );

        for (const expression of realPaths) {
            const expected = reference(expression);
            for (const state of [populated, {}]) {
                expect([expression, walkers.get(expression)!(state, undefined)]).toEqual([
                    expression,
                    expected(state, undefined),
                ]);
            }
        }
    });

    const CASES: [expression: string, state: unknown, scope: unknown, pins: string][] = [
        ['ui.density', { ui: { density: 'state' } }, { ui: { density: 'scope' } }, 'scope wins over state'],
        ['item.name', { item: { name: 'state' } }, undefined, 'no scope falls back to state'],
        ['item.name', {}, { item: { name: 'scope' } }, 'scope-only binding (data-each rows)'],
        ['missing.deeply.nested', {}, undefined, 'unknown head identifier is a ReferenceError'],
        ['ui.missing.deeper', { ui: {} }, undefined, 'stepping into undefined is a TypeError'],
        ['ui.nulled.deeper', { ui: { nulled: null } }, undefined, 'stepping into null is a TypeError'],
        ['!ui.open', { ui: { open: 0 } }, undefined, 'negation of a falsy value'],
        ['!ui.missing.deeper', { ui: {} }, undefined, 'a throwing negation is undefined, NOT true'],
        ['!missing', {}, undefined, 'negating an unknown identifier'],
        ['rows.0.name', { rows: [{ name: 'first' }] }, undefined, 'numeric path segment indexes an array'],
        ['rows.0', { rows: [] }, undefined, 'out-of-range numeric segment'],
        ['ui.density', null, { ui: { density: 'scope' } }, 'nullish state throws before the scope is consulted'],
        ['title.length', { title: 'abcd' }, undefined, 'property of a primitive'],
        ['ui', { ui: { a: 1 } }, undefined, 'single-segment path returns the object itself'],
    ];

    it.each(CASES)('matches the wrapper for %s: %#', (expression, state, scope) => {
        const walk = compile([expression]).get(expression)!;
        expect(walk(state, scope)).toEqual(reference(expression)(state, scope));
    });

    it('leaves non-path expressions as literal wrappers', () => {
        const complex = "a.b ? strings.yes : strings.no";
        const source = emitClassicPrecompileSource(['ui.density', complex]);
        expect(source).toContain('"ui.density",[');
        expect(source).toContain('with(s)with(c||{})return(a.b ? strings.yes : strings.no)');
        // ...and only one wrapper survives for the two of them.
        expect(source.match(/with\(s\)/g)).toHaveLength(1);
    });
});
