/// <reference types="node" />
// Scoped to this file only (not tsconfig's global "types") so src/ stays
// browser-only — Node ambient globals must never leak into app code.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Minimal Vitest setup, brought forward from Phase 27's scope because
// Phase 02's own tasks (router parsing, view-switching, density mapping)
// need real specs now. Phase 27 formalizes conventions/coverage/fixtures
// on top of this — this file stays intentionally small until then.
export default defineConfig({
    resolve: {
        alias: {
            // Vitest (unlike a browser) has no import map, so the bare
            // 'spektrum' specifier needs a real resolution target. Point it
            // at the vendored copy (Feature 01.5) rather than a mock —
            // specs exercise the real engine, not a stand-in.
            //
            // Specifically the *generated* runtime, which is what the app
            // loads: it is the pinned build with its expression-cache cap
            // raised (see scripts/spektrum-csp.mjs). Resolving specs against
            // the unpatched `spektrum.min.js` would mean the one property
            // src/app/spektrum-csp.spec.ts exists to protect is the one
            // property tests don't share with production.
            spektrum: fileURLToPath(new URL('./public/vendor/spektrum.runtime.js', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        // `scripts/` is Node, not browser — those specs opt into the node
        // environment per-file with a `@vitest-environment node` docblock.
        include: ['src/**/*.spec.ts', 'scripts/**/*.spec.mts'],
        css: false,
        // Feature 06.3.8: jsdom has no real Worker implementation at all
        // (`new Worker(...)` throws `ReferenceError`) — @vitest/web-worker
        // simulates one in the same thread (real postMessage/addEventListener
        // semantics, structured-clone message passing), so parser-client.spec.ts
        // can exercise the real `ParserClient` against the real
        // `parser.worker.ts` instead of a hand-rolled fake.
        setupFiles: ['@vitest/web-worker'],
    },
});
