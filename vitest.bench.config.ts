/// <reference types="node" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Feature 06.10.9: a dedicated config for the heavy 100k-channel benchmark
// (src/m3u/parser.bench.ts) so `npm test` (vitest.config.ts, which only
// includes `src/**/*.spec.ts`) never runs it — `npm run bench:m3u` is the
// only entry point. Mirrors vitest.config.ts's jsdom/Worker/Spektrum setup
// since the benchmark exercises the real ParserClient/parser.worker.ts.
export default defineConfig({
    resolve: {
        alias: {
            spektrum: fileURLToPath(new URL('./public/vendor/spektrum.min.js', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['src/m3u/parser.bench.ts'],
        css: false,
        setupFiles: ['@vitest/web-worker'],
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});
