import { defineConfig, type Plugin } from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * Spektrum resolves through the browser's import map (index.html), never
 * through Vite. `build.rollupOptions.external` alone only covers the
 * production build (Rollup preserves bare external specifiers in its
 * output verbatim). Vite's dev-server import-analysis plugin is stricter:
 * even a `resolveId` result marked `external: true` gets rewritten to an
 * internal `/@id/spektrum` marker rather than left as the literal bare
 * specifier `externalRE` (`^([a-z]+:)?\/\/`, vite/dist/node/chunks/node.js)
 * only special-cases fully-qualified URLs, not bare names. The `transform`
 * hook below runs after import-analysis (`enforce: 'post'`) and rewrites
 * that marker back to a bare `"spektrum"` import, so the *exact* code the
 * browser evaluates in dev matches production: a real ESM import the
 * browser's import map resolves at runtime, never something Vite bundles.
 */
function externalizeSpektrum(): Plugin {
    const idMarker = '/@id/spektrum';

    return {
        name: 'externalize-spektrum',
        resolveId(source) {
            if (source === 'spektrum') return { id: 'spektrum', external: true };
            return null;
        },
        transform: {
            order: 'post',
            handler(code, id) {
                if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
                if (!code.includes(idMarker)) return null;
                return code.replaceAll(idMarker, 'spektrum');
            },
        },
    };
}

export default defineConfig({
    // Relative asset URLs, not root-absolute. One dist/ then loads correctly
    // from all three consumers: a GitHub Pages subpath (/thundertv/), a
    // packaged Electron `file://` window, and a packaged webOS app.
    base: './',
    plugins: [externalizeSpektrum(), cloudflare()],
    build: {
        rollupOptions: {
            external: ['spektrum'],
            // `output.manualChunks` is reserved for Phase 10/11: player
            // engines (hls.js, mpegts.js) get their own lazy-loaded chunks
            // so the browse UI never pays for them up front. Nothing to
            // split yet, so it's left unset rather than an empty stub —
            // Rollup's `manualChunks` type rejects `{}` as ambiguous
            // between its function and Record<string, string[]> overloads.
        },
    },
    worker: {
        // Parser workers (Phase 06/16) use `new Worker(new URL(...), {
        // type: 'module' })`, which needs ES-module worker output to keep
        // working under `base: './'`.
        format: 'es',
    },
    optimizeDeps: {
        // Nothing to pre-bundle: 'spektrum' isn't an npm dependency, so Vite
        // must never try to resolve/pre-bundle the bare specifier itself.
        exclude: ['spektrum'],
    },
});