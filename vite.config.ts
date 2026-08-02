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

/**
 * `KeyMeta.description` is documentation, not behaviour: nothing in `src/`
 * reads it at runtime, and `scripts/gen-state-keys.mjs` parses the registry
 * as *source text* rather than importing it, so the generated reference doc
 * is unaffected by dropping the strings from the bundle. Together the two
 * registry files carried ~15 kB of prose into every user's initial download.
 *
 * Deliberately strict: the plugin asserts it stripped at least
 * `MIN_EXPECTED_STRIPS` properties from each file and throws otherwise, so a
 * reformat that silently stops matching fails the build instead of quietly
 * putting 15 kB back. Only value lines match — `KeyMeta`'s own
 * `description: string;` declaration has no quotes and is left alone.
 */
function stripRegistryDescriptions(): Plugin {
    const TARGETS = ['src/state/registry-keys.ts', 'src/state/registry-overflow.ts'];
    const MIN_EXPECTED_STRIPS: Record<string, number> = {
        'src/state/registry-keys.ts': 50,
        'src/state/registry-overflow.ts': 25,
    };
    // A whole `description: '…',` line, single- or double-quoted, honouring
    // backslash escapes so an apostrophe inside the prose cannot end the match.
    const pattern = /^[ \t]*description: (['"])(?:\\.|(?!\1)[^\\])*\1,\r?\n/gm;

    return {
        name: 'strip-registry-descriptions',
        apply: 'build',
        transform: {
            // Must run before the TypeScript→JS transform: afterwards the
            // object literals have been reformatted and the line-anchored
            // pattern below no longer matches (verified — it silently found
            // zero, which is exactly what the strict count guard caught).
            order: 'pre',
            handler(code, id) {
                const normalized = id.replaceAll('\\', '/');
                const target = TARGETS.find((t) => normalized.endsWith(t));
                if (target === undefined) return null;

                let stripped = 0;
                const out = code.replace(pattern, () => {
                    stripped += 1;
                    return '';
                });

                const min = MIN_EXPECTED_STRIPS[target] ?? 1;
                if (stripped < min) {
                    throw new Error(
                        `strip-registry-descriptions: only stripped ${String(stripped)} description(s) from ${target}, expected at least ${String(min)}. ` +
                            'The registry format changed — update the pattern in vite.config.ts rather than shipping the prose.',
                    );
                }
                return { code: out, map: null };
            },
        },
    };
}

/**
 * Vite rewrites asset URLs in `index.html` but does not minify it, so the
 * built shell shipped the source's ~35 kB of explanatory HTML comments and
 * ~104 kB of indentation verbatim — together ~58% of the single largest
 * eager artifact, on the critical path of every boot including a webOS TV's.
 *
 * Three transforms, deliberately conservative:
 *  1. drop `<!-- … -->` comments,
 *  2. drop each line's leading indentation,
 *  3. collapse runs of blank lines.
 *
 * The newline between two lines always survives, so inline-element spacing
 * (`</span>\n<span>` still renders one space) is untouched. The whitespace-
 * sensitive variant — joining `>\s*\n\s*<` into `><` — is deliberately NOT
 * done: it buys ~1 KiB raw / 0.06 KiB gzip more and is exactly the transform
 * that silently eats inter-word spacing. Verified safe for the current
 * markup: no `<pre>`, no `white-space: pre*` rule, no `:empty` selector, the
 * one `<textarea>` is empty, no attribute value spans a newline, and the only
 * inline `<script>` is the one-line import map.
 *
 * Source `index.html` keeps every comment: `scripts/check-markup.mjs` and
 * `scripts/spektrum-csp.mjs` both read the source file, never this output.
 *
 * Strict like `stripRegistryDescriptions()`: if a markup reformat stops the
 * patterns matching, the build fails loudly instead of quietly putting
 * 130 KiB back on the boot path.
 */
function minifyIndexHtml(): Plugin {
    const MIN_COMMENTS = 60;
    const MIN_DEDENTED_LINES = 2000;

    return {
        name: 'minify-index-html',
        apply: 'build',
        transformIndexHtml: {
            order: 'post',
            handler(html) {
                let comments = 0;
                let dedented = 0;

                const out = html
                    .replace(/<!--[\s\S]*?-->/g, () => {
                        comments += 1;
                        return '';
                    })
                    .replace(/^[ \t]+/gm, () => {
                        dedented += 1;
                        return '';
                    })
                    .replace(/\n{2,}/g, '\n');

                if (comments < MIN_COMMENTS || dedented < MIN_DEDENTED_LINES) {
                    throw new Error(
                        `minify-index-html: stripped ${String(comments)} comment(s) and dedented ${String(dedented)} line(s), ` +
                            `expected at least ${String(MIN_COMMENTS)} and ${String(MIN_DEDENTED_LINES)}. ` +
                            'index.html changed shape — update the patterns in vite.config.ts rather than shipping the formatting.',
                    );
                }
                return out;
            },
        },
    };
}

export default defineConfig(({ mode }) => ({
    // Relative asset URLs, not root-absolute. One dist/ then loads correctly
    // from all three consumers: a GitHub Pages subpath (/thundertv/), a
    // packaged Electron `file://` window, and a packaged webOS app.
    base: './',
    plugins: [externalizeSpektrum(), stripRegistryDescriptions(), minifyIndexHtml()],
    build: {
        // `--mode webos` (npm run build:lg) builds to a separate directory
        // and a lower syntax floor than the evergreen web/Electron build.
        // Kept out of the default `dist/` so `npm run deploy` and
        // desktop/'s `prepackage` — both plain `npm run build` — can never
        // pick up the webOS-swapped output by accident.
        outDir: mode === 'webos' ? 'dist-webos' : 'dist',
        // webOS TVs from the confirmed compatibility floor (webOS 6+,
        // ~2021+) ship Chromium 87+. Packaged JS imports are rewritten to
        // the relative vendored Spektrum file, so native import-map support
        // is not required. The engine is otherwise close enough to evergreen
        // that no aggressive syntax down-leveling is needed. Other modes keep esbuild's
        // default (evergreen) target — `exactOptionalPropertyTypes` forbids
        // setting `target: undefined` explicitly, so it's omitted via
        // spread instead.
        ...(mode === 'webos' ? { target: 'chrome87' } : {}),
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
}));
