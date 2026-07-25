import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mapItemToChannelRow } from './channel-mapper';
import { parseM3u } from './parse-m3u';

// See parse-m3u.spec.ts's comment: jsdom's global `URL` polyfill mis-resolves
// a relative URL against a `file://` base, so `URL` is imported explicitly
// from `node:url` here instead of relying on the (jsdom-overridden) global.
const corpusDir = fileURLToPath(new NodeURL('../../tests/fixtures/m3u/malformed', import.meta.url));

function readCorpusFixture(name: string): string {
    return readFileSync(`${corpusDir}/${name}`, 'utf8');
}

/** Runs the real pipeline (parse -> map -> count skipped) a chunked-import caller would run — never the raw parse result alone, since "skipped" is a mapper-level concept (Feature 06.7.5). */
function runPipeline(m3u: string): { total: number; skipped: number } | { error: true } {
    const parsed = parseM3u(m3u);
    if (!parsed.ok) return { error: true };

    const mapped = parsed.playlist.items.map(mapItemToChannelRow);
    const skipped = mapped.filter((row) => row === null).length;
    return { total: mapped.length - skipped, skipped };
}

/**
 * Table-driven malformed-corpus suite (Feature 06.7.7) — asserts, per real
 * observed fixture in `tests/fixtures/m3u/malformed/` (see that directory's
 * README for provenance), that the pipeline never throws and produces the
 * exact `{ total, skipped }` pair the fixture's real shape implies. Every
 * expected value below was captured by actually running the fork's
 * `parse()` against each fixture and reading its real output (not assumed
 * from the fixture's name) — see the Phase 06 completion notes for the
 * specific behaviors this uncovered (e.g. a non-trailing url-less #EXTINF
 * is silently dropped by the fork itself, before the mapper ever sees it).
 */
describe('malformed-playlist tolerance (Feature 06.7.2)', () => {
    it.each([
        ['unbalanced-quotes.m3u', { total: 2, skipped: 0 }],
        ['extinf-without-url.m3u', { total: 2, skipped: 0 }],
        ['trailing-extinf-no-url.m3u', { total: 1, skipped: 1 }],
        ['duplicate-extinf.m3u', { total: 1, skipped: 0 }],
        ['binary-garbage.m3u', { total: 2, skipped: 0 }],
        ['truncated-mid-line.m3u', { total: 2, skipped: 0 }],
        ['bom.m3u', { total: 1, skipped: 0 }],
        ['crlf-and-cr-line-endings.m3u', { total: 1, skipped: 0 }],
    ] as const)('never throws on %s, salvaging %j', (fixtureName, expected) => {
        const m3u = readCorpusFixture(fixtureName);
        expect(() => runPipeline(m3u)).not.toThrow();
        expect(runPipeline(m3u)).toEqual(expected);
    });

    it('only a header-less playlist (zero salvageable channels) produces an error result', () => {
        const m3u = readCorpusFixture('missing-header.m3u');
        expect(runPipeline(m3u)).toEqual({ error: true });
    });

    it('a genuinely truncated trailing entry is dropped by the mapper and counted skipped, not silently lost', () => {
        const parsed = parseM3u(readCorpusFixture('trailing-extinf-no-url.m3u'));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.playlist.items).toHaveLength(2);
        expect(parsed.playlist.items[1]?.url).toBeUndefined();
        expect(mapItemToChannelRow(parsed.playlist.items[1]!)).toBeNull();
    });
});

/**
 * Regression fixtures for the specific malformed shapes the pinned fork tag
 * (`v0.15.2-iptvnator.2`) fixes over plain upstream (Feature 06.7.6):
 * `radio` attribute support and BOM/blank-line tolerance ahead of the
 * header. These pass today because the fork already handles them
 * internally (Feature 06.2.9's header comment) — a future parser
 * swap/upgrade that regresses either would fail here first.
 */
describe('patched-fork regression fixtures (Feature 06.7.3/06.7.6)', () => {
    it('strips a leading UTF-8 BOM before the #EXTM3U header (fork-internal, not re-implemented by this wrapper)', () => {
        const result = parseM3u(readCorpusFixture('bom.m3u'));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.playlist.items).toHaveLength(1);
        expect(result.playlist.items[0]?.name).toBe('BOM Channel');
    });

    it('tolerates blank lines before a case-insensitive #EXTM3U header', () => {
        const result = parseM3u('\n\n  \n#extm3u\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.playlist.items).toHaveLength(1);
    });

    it('recognizes the radio="true" attribute the fork adds over upstream', () => {
        const result = parseM3u(
            '#EXTM3U\n#EXTINF:-1 radio="true",Radio Station\nhttps://example.com/radio.m3u8\n',
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.playlist.items[0]?.radio).toBe('true');
    });
});

/**
 * Light fuzzing (Feature 06.7.8): parse random truncations of the sample
 * fixture at ~50 seeded cut points, asserting the pipeline always answers
 * (never throws) regardless of where the file was cut. A full worker-level
 * fuzz (asserting a well-formed WorkerOut message specifically) lives
 * alongside the worker once it exists (parser.worker.spec.ts).
 */
describe('fuzzing (Feature 06.7.8)', () => {
    it('never throws on any truncation of the sample fixture', () => {
        const full = readFileSync(
            fileURLToPath(new NodeURL('../../tests/fixtures/m3u/sample.m3u', import.meta.url)),
            'utf8',
        );
        // Deterministic, seeded cut points (no Math.random) — a fixed linear
        // congruential sequence over the fixture's length.
        let seed = 42;
        const next = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed;
        };

        for (let i = 0; i < 50; i += 1) {
            const cutAt = next() % full.length;
            const truncated = full.slice(0, cutAt);
            expect(() => runPipeline(truncated)).not.toThrow();
        }
    });
});
