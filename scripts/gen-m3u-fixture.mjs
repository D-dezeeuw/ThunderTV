#!/usr/bin/env node
// Deterministic, seeded M3U fixture generator (Feature 06.10.1). Produces
// playlists of arbitrary size with realistic groups, logos, tvg-ids, a
// `radio="true"` slice, and `#KODIPROP` ClearKey blocks, so the parsing
// engine's <5s/100k-channel budget (MASTERPLAN.md §3) is a number the repo
// can reproduce on demand instead of a hand-authored one-off fixture.
//
// CLI usage (writes into the git-ignored tests/fixtures/generated/,
// Feature 06.10.2 — the generator is committed, its output never is):
//   node scripts/gen-m3u-fixture.mjs --count=100000 --seed=42
//   node scripts/gen-m3u-fixture.mjs --count=10000 --out=tests/fixtures/generated/10k.m3u
//
// `generateM3uFixture()` is also imported directly by src/m3u/parser.bench.ts
// and src/m3u/parser-perf-smoke.spec.ts so the benchmark and the always-on
// smoke test exercise the exact same generator as this CLI, never a
// second hand-copied implementation.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GROUP_COUNT = 200;
const RADIO_RATIO = 0.05;
const DRM_RATIO = 0.01;

/** Same LCG formula as src/m3u/malformed.spec.ts's fuzz test — deterministic, no Math.random. */
export function createLcg(seed) {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state;
    };
}

function buildClearKeyBlock(next) {
    const kid = next().toString(16).padStart(8, '0').repeat(4).slice(0, 32);
    const key = next().toString(16).padStart(8, '0').repeat(4).slice(0, 32);
    return [
        '#KODIPROP:inputstream.adaptive.license_type=clearkey',
        `#KODIPROP:inputstream.adaptive.license_key=${kid}:${key}`,
    ];
}

/**
 * Builds `count` channels across ~`GROUP_COUNT` groups with a deterministic
 * `radio`/ClearKey slice. Returns the M3U text plus the exact counts the
 * caller planted, so tests can assert against ground truth instead of
 * re-deriving it from the string.
 */
export function generateM3uFixture({ count, seed = 42 }) {
    const next = createLcg(seed);
    const lines = ['#EXTM3U x-tvg-url="https://example.com/epg.xml"'];
    let radioCount = 0;
    let drmCount = 0;

    for (let i = 0; i < count; i += 1) {
        const n = i + 1;
        const group = `Group ${String((i % GROUP_COUNT) + 1).padStart(3, '0')}`;
        const isRadio = next() % 1000 < RADIO_RATIO * 1000;
        const isDrm = next() % 1000 < DRM_RATIO * 1000;
        if (isRadio) radioCount += 1;
        if (isDrm) drmCount += 1;

        const radioAttr = isRadio ? ' radio="true"' : '';
        lines.push(
            `#EXTINF:-1 tvg-id="ch${String(n)}" tvg-logo="https://example.com/logos/ch${String(n)}.png" group-title="${group}"${radioAttr},Channel ${String(n)}`,
        );
        if (isDrm) {
            lines.push(...buildClearKeyBlock(next));
        }
        lines.push(`https://example.com/streams/ch${String(n)}.m3u8`);
    }

    return { text: lines.join('\n') + '\n', count, radioCount, drmCount, groupCount: Math.min(count, GROUP_COUNT) };
}

function parseArgs(argv) {
    const args = { count: 10_000, seed: 42, out: null };
    for (const arg of argv) {
        const [key, value] = arg.replace(/^--/, '').split('=');
        if (key === 'count') args.count = Number.parseInt(value, 10);
        else if (key === 'seed') args.seed = Number.parseInt(value, 10);
        else if (key === 'out') args.out = value;
    }
    return args;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const args = parseArgs(process.argv.slice(2));
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const outPath = args.out
        ? `${repoRoot}${args.out}`
        : `${repoRoot}tests/fixtures/generated/${String(args.count)}.m3u`;

    const fixture = generateM3uFixture({ count: args.count, seed: args.seed });
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, fixture.text);
    console.log(
        `gen-m3u-fixture: wrote ${outPath} (${String(fixture.count)} channels, ${String(fixture.radioCount)} radio, ${String(fixture.drmCount)} DRM, ${String(fixture.groupCount)} groups, seed=${String(args.seed)})`,
    );
}
