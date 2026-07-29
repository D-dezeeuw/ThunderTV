import { describe, expect, it } from 'vitest';
import { DEFAULT_SEARCH_LIMIT, fuzzyScore, rankSearch } from './fuzzy';
import { normalizeForSearch } from './normalize';

describe('fuzzyScore', () => {
    it('matches the whole normalized string exactly', () => {
        expect(fuzzyScore('npo 1 hd', 'npo 1 hd')).not.toBeNull();
    });

    it('returns null when the query is not even an in-order subsequence', () => {
        expect(fuzzyScore('cba', 'abc')).toBeNull(); // right letters, wrong order
        expect(fuzzyScore('xyz', 'npo 1 hd')).toBeNull(); // letters absent entirely
    });

    describe('tier ordering (exact > substring > word-prefix > subsequence)', () => {
        it('scores an exact match above a substring match', () => {
            const exact = fuzzyScore('npo 1 hd', 'npo 1 hd');
            const substring = fuzzyScore('npo 1 hd', 'the npo 1 hd channel');
            expect(exact).not.toBeNull();
            expect(substring).not.toBeNull();
            expect(exact!).toBeGreaterThan(substring!);
        });

        it('scores a substring match above a word-prefix-only match', () => {
            // Literal substring present.
            const substring = fuzzyScore('npo hd', 'zzz npo hd zzz');
            // Each query word prefixes a target word, but "npo hd" never
            // occurs verbatim ("one" sits between them) — word-prefix
            // tier, not substring.
            const prefixOnly = fuzzyScore('npo hd', 'npo one hd channel');
            expect(substring).not.toBeNull();
            expect(prefixOnly).not.toBeNull();
            expect(substring!).toBeGreaterThan(prefixOnly!);
        });

        it('scores a word-prefix match above a subsequence-only match', () => {
            const prefix = fuzzyScore('npo hd', 'npo one hd channel');
            // "npoh" is a subsequence of "npo one hd" (n-p-o-...-h) but no
            // single target word is 4+ characters starting with "npoh", so
            // this can only reach the subsequence tier.
            const subsequenceOnly = fuzzyScore('npoh', 'npo one hd');
            expect(prefix).not.toBeNull();
            expect(subsequenceOnly).not.toBeNull();
            expect(prefix!).toBeGreaterThan(subsequenceOnly!);
        });

        it('requires query words to match target words in the same order', () => {
            // Reversed order: "1" then "npo" never lines up with target
            // words "npo", "1", "hd" walked left to right.
            expect(fuzzyScore('1 npo', 'npo 1 hd')).toBeNull();
        });
    });

    describe('subsequence tightness', () => {
        it('scores a tighter subsequence span above a looser one', () => {
            const tight = fuzzyScore('abc', 'a b c');
            const loose = fuzzyScore('abc', 'a xxxxxxxx b xxxxxxxx c');
            expect(tight).not.toBeNull();
            expect(loose).not.toBeNull();
            expect(tight!).toBeGreaterThan(loose!);
        });
    });

    describe('same-tier length boost', () => {
        it('prefers the shorter target when both match at the same position/tier', () => {
            const shortTarget = fuzzyScore('npo', 'npo 1');
            const longTarget = fuzzyScore('npo', 'npo 1 hd extra padding words here');
            expect(shortTarget).not.toBeNull();
            expect(longTarget).not.toBeNull();
            expect(shortTarget!).toBeGreaterThan(longTarget!);
        });
    });

    describe('realistic normalized channel/title names', () => {
        it('finds a diacritic title by its folded ASCII query', () => {
            const key = normalizeForSearch('König der Löwen');
            const score = fuzzyScore(normalizeForSearch('konig'), key);
            expect(score).not.toBeNull();
        });

        it('finds a decorated channel name past its box-drawing and glyphs', () => {
            const key = normalizeForSearch('┃NL┃ NPO 1 HD  ⏺ʳᵉᶜ');
            expect(fuzzyScore(normalizeForSearch('npo 1'), key)).not.toBeNull();
            expect(fuzzyScore(normalizeForSearch('nl npo'), key)).not.toBeNull();
        });

        it('finds a movie title regardless of the year/quality suffix', () => {
            const key = normalizeForSearch('Avengers: Endgame (2019) 4K');
            expect(fuzzyScore(normalizeForSearch('endgame'), key)).not.toBeNull();
            expect(fuzzyScore(normalizeForSearch('avengers 2019'), key)).not.toBeNull();
        });
    });
});

describe('rankSearch', () => {
    interface Item {
        id: string;
        key: string;
    }

    function item(id: string, key: string): Item {
        return { id, key };
    }

    it('sorts matches by score descending and drops non-matches', () => {
        const items = [
            item('loose', 'z n z p z o'), // subsequence only, loose span
            item('exact', 'npo'),
            item('nomatch', 'rtl 4 hd'),
            item('substring', 'the npo channel'),
        ];

        const ranked = rankSearch('npo', items, (i) => i.key);
        expect(ranked.map((i) => i.id)).toEqual(['exact', 'substring', 'loose']);
    });

    it('keeps original relative order for equal scores (stable tie-break)', () => {
        const items = [item('a', 'npo'), item('b', 'npo'), item('c', 'npo')];
        const ranked = rankSearch('npo', items, (i) => i.key);
        expect(ranked.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    });

    it('normalizes the query itself, so callers may pass raw user input', () => {
        const items = [item('nl-npo1', normalizeForSearch('┃NL┃ NPO 1 HD'))];
        const ranked = rankSearch('  NPO   1  ', items, (i) => i.key);
        expect(ranked.map((i) => i.id)).toEqual(['nl-npo1']);
    });

    it('defaults to a bounded result count and allows Infinity to lift it', () => {
        const items = Array.from({ length: DEFAULT_SEARCH_LIMIT + 50 }, (_, i) =>
            item(String(i), 'npo channel'),
        );

        const bounded = rankSearch('npo', items, (i) => i.key);
        expect(bounded.length).toBe(DEFAULT_SEARCH_LIMIT);

        const unbounded = rankSearch('npo', items, (i) => i.key, Infinity);
        expect(unbounded.length).toBe(items.length);
    });

    it('returns nothing when nothing matches', () => {
        const items = [item('a', 'rtl 4 hd'), item('b', 'sbs 6 hd')];
        expect(rankSearch('zzz', items, (i) => i.key)).toEqual([]);
    });
});

describe('performance (loose CI guard)', () => {
    // Synthetic corpus sized to the live-channel scale this module is built
    // for (~20k rows). Titles are already in "normalized key" shape
    // (lowercase letters/digits/spaces only) — that's the contract
    // rankSearch relies on: normalization happens once per row at load
    // time, never inside this loop.
    const VOCAB = [
        'npo',
        'rtl',
        'sbs',
        'sport',
        'news',
        'music',
        'radio',
        'hd',
        'fhd',
        'uhd',
        'live',
        'channel',
        'movies',
        'series',
        'the',
        'avengers',
        'endgame',
        'konig',
        'lowen',
        'plus',
        'extra',
        'info',
        'one',
        'two',
        'three',
        'zero',
        'alpha',
        'beta',
    ];

    function syntheticTitle(i: number): string {
        const wordCount = 3 + (i % 4);
        const words: string[] = [];
        for (let w = 0; w < wordCount; w++) {
            words.push(VOCAB[(i * 31 + w * 17) % VOCAB.length]!);
        }
        return words.join(' ');
    }

    it('ranks a 3-char query over 20,000 rows well under a generous CI budget', () => {
        const rows = Array.from({ length: 20_000 }, (_, i) => ({ key: syntheticTitle(i) }));

        const start = performance.now();
        rankSearch('npo', rows, (r) => r.key, Infinity);
        const elapsedMs = performance.now() - start;

        // Measured budget in practice is under 50ms on ordinary dev
        // hardware; the assertion allows 200ms so shared/throttled CI
        // runners never flake on this test.
        expect(elapsedMs).toBeLessThan(200);
    });
});
