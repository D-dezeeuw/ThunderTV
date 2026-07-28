import { defineConfig, type Plugin } from 'vite';

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
    plugins: [externalizeSpektrum()],
    build: {
        /**
         * The default 500 kB warning fires on one chunk, and it is a chunk
         * that is already doing the right thing: hls.js (~509 kB) is a
         * third-party decoder reached only through `await import('hls.js')`
         * in src/player/engine.ts, so it is fetched when a stream actually
         * needs the HLS engine and never on load. There is nothing left to
         * split — the advice in the warning (code-split with dynamic
         * import) is what put it in its own chunk in the first place.
         *
         * Raised to 600 rather than switched off, so the warning still
         * fires on a real regression, and paired with scripts/check-dist.mjs
         * which enforces the thing that actually matters: the entry chunk
         * stays small and neither engine leaks into it.
         */
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            external: ['spektrum'],
            // No `output.manualChunks`: both player engines (hls.js,
            // mpegts.js) already split themselves out via `await import()`
            // at their use sites, which is what keeps the browse UI from
            // paying for them up front. Rollup's `manualChunks` type
            // rejects `{}` as ambiguous between its function and
            // Record<string, string[]> overloads, so it is left unset
            // rather than stubbed.
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
