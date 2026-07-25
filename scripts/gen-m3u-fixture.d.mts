/**
 * Ambient declaration for `gen-m3u-fixture.mjs` — a plain-JS Node script
 * (`allowJs` stays `false` project-wide, Feature 01.2) imported directly by
 * `src/m3u/parser.bench.ts` and `src/m3u/parser-perf-smoke.spec.ts` so the
 * benchmark, the always-on smoke test, and the CLI all share one generator
 * implementation instead of three.
 */
export interface GeneratedM3uFixture {
    text: string;
    count: number;
    radioCount: number;
    drmCount: number;
    groupCount: number;
}

export function createLcg(seed: number): () => number;

export function generateM3uFixture(options: { count: number; seed?: number }): GeneratedM3uFixture;
