/// <reference types="node" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Feature 06.10.9/08.9.10: a dedicated config for the heavy benchmarks
// (src/m3u/parser.bench.ts, src/ui/virtual-list.bench.ts) so `npm test`
// (vitest.config.ts, which only includes `src/**/*.spec.ts`) never runs
// them — `npm run bench:m3u`/`npm run bench:list` are the only entry
// points (each passes its own file as a CLI filter against this shared
// config). Mirrors vitest.config.ts's jsdom/Worker/Spektrum setup since
// both benchmarks exercise real engine code (ParserClient/parser.worker.ts,
// virtual-list.ts).
export default defineConfig({
    resolve: {
        alias: {
            spektrum: fileURLToPath(new URL('./public/vendor/spektrum.min.js', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        include: ['src/m3u/parser.bench.ts', 'src/ui/virtual-list.bench.ts'],
        css: false,
        setupFiles: ['@vitest/web-worker'],
        testTimeout: 30_000,
        hookTimeout: 30_000,
    },
});
