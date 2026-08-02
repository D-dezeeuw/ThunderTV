import { bindDOM, precompile, resetState, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Regression cover for the failure that made the desktop build render a
 * structurally correct UI with every label blank.
 *
 * `precompile()` writes into the same bounded LRU that expression lookup
 * reads from, so registering more expressions than the cap evicts the
 * earliest ones *before* `bindDOM()` runs. Each evicted expression then
 * falls back to `new Function(...)`, which this app's deliberately
 * `unsafe-eval`-free CSP blocks, and the binding silently yields
 * `undefined` — blank text everywhere rather than a visible error.
 *
 * These specs don't simulate the CSP, which would mean stubbing the
 * `Function` constructor and hoping nothing else in the runtime needs it.
 * They measure the thing underneath, which is both simpler and stricter:
 * whether a precompiled function is still the one Spektrum uses. Compiling
 * `PROBE` from real state can only ever produce `undefined`, so the
 * sentinel appears if and only if the registration survived.
 *
 * `scripts/check-csp.mjs` owns the other half — comparing the template's
 * real expression count against the runtime's real cap. This file proves
 * the capacity exists; that check proves we are inside it.
 */

const SENTINEL = 'PRECOMPILED';

/** No state path can satisfy this, so only the registered function can produce the sentinel. */
const PROBE = '__csp_probe__';

/**
 * Comfortably above `index.html`'s current expression count (724 at the
 * time of writing). Headroom is the point: the template only grows, and a
 * floor set at today's number would pass right up until the day it
 * silently breaks again.
 */
const REQUIRED_CAPACITY = 1500;

afterEach(() => {
    resetState();
});

/** Registers the probe first, then `count` throwaways — the order a large template produces. */
function registerProbeThenFiller(count: number): void {
    precompile(PROBE, () => SENTINEL);
    for (let i = 0; i < count; i += 1) {
        precompile(`__filler_${String(i)}__`, () => '');
    }
}

function renderProbe(): string {
    const root = document.createElement('div');
    root.innerHTML = `<p data-testid="probe">{{ ${PROBE} }}</p>`;
    document.body.append(root);
    bindDOM(root);
    tick();
    const text = root.querySelector('[data-testid="probe"]')?.textContent ?? '';
    root.remove();
    return text;
}

describe('Spektrum CSP expression registry', () => {
    it('uses a precompiled expression when few are registered', () => {
        // Baseline, so a failure below is unambiguously about capacity and
        // not about the probe technique itself.
        registerProbeThenFiller(10);
        expect(renderProbe()).toBe(SENTINEL);
    });

    it('still holds the first registration after a full template is registered', () => {
        registerProbeThenFiller(REQUIRED_CAPACITY);
        expect(renderProbe()).toBe(SENTINEL);
    });
});
