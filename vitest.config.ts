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
            spektrum: fileURLToPath(new URL('./public/vendor/spektrum.min.js', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.spec.ts'],
        css: false,
    },
});
