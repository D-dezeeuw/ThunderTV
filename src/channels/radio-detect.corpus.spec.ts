import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isRadioGroup, looksLikeRadioName } from './radio-detect';

/**
 * The group-majority rule is the part of radio detection that can go wrong
 * quietly: over-fire and a whole television bundle disappears out of Live
 * into Radio, with nothing on screen to say why.
 *
 * So it is checked against the real thing — the 20k-row provider dump in
 * the committed config export (`.claude/context/…`), which is all
 * television. Not one of its 600-odd categories may be read as a radio
 * bundle.
 */

const repoRoot = fileURLToPath(new NodeURL('../..', import.meta.url));
const xmlPath = `${repoRoot}/.claude/context/thundertv-transformed-config-demo.xml`;

interface Category {
    name: string;
    names: string[];
}

function loadCategories(): Category[] {
    const xml = readFileSync(xmlPath, 'utf8');
    const block = xml.slice(xml.indexOf('<channels '), xml.indexOf('</channels>'));
    const byGroup = new Map<string, string[]>();

    for (const match of block.matchAll(/<channel raw="([^"]*)" group="([^"]*)"/g)) {
        const unescape = (s: string): string =>
            s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
        const name = unescape(match[1] ?? '');
        const group = unescape(match[2] ?? '');
        const bucket = byGroup.get(group);
        if (bucket) bucket.push(name);
        else byGroup.set(group, [name]);
    }

    return [...byGroup].map(([name, names]) => ({ name, names }));
}

/**
 * The provider's real station names. They are past the export's 20k
 * truncation point, but the `<live-filter>` block lists every one of them
 * — they are the 131 rows that leaked into the Live list, which is what
 * made this a bug report in the first place.
 */
function loadStationNames(): string[] {
    const xml = readFileSync(xmlPath, 'utf8');
    const block = xml.slice(xml.indexOf('<live-filter>'), xml.indexOf('</live-filter>'));
    return [...block.matchAll(/<channel name="([^"]*)"/g)].map((m) =>
        (m[1] ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
    );
}

const categories = loadCategories();
const stations = loadStationNames();

describe('radio detection against the real provider dump', () => {
    it('reads a catalogue of 20k television rows', () => {
        expect(categories.length).toBeGreaterThan(500);
        expect(categories.reduce((n, c) => n + c.names.length, 0)).toBe(20000);
    });

    it('classifies none of its categories as a radio bundle', () => {
        const misread = categories.filter((c) => isRadioGroup(c.name, c.names)).map((c) => c.name);
        expect(misread).toEqual([]);
    });

    it('claims no television row on its name alone', () => {
        const claimed = categories.flatMap((c) => c.names.filter((name) => looksLikeRadioName(name)));

        // Six rows out of twenty thousand, every one of which names the
        // medium outright and carries no picture marker — Chada FM,
        // Mosaïque FM, Syria FM, Radio Zeta and TCV Cabo Radio are stations
        // this provider files among its TV channels. Landing them in Radio
        // is the right answer, not a miss.
        //
        // What must never appear here are the television channels with
        // "radio" in the title — RADIO BREMEN TV, ICI RADIO-CANADA TELE,
        // RADIO ITALIA HD, RTL RADIO HD. Each carries a quality or TV
        // marker, which is exactly what rules them out.
        expect(claimed.sort()).toEqual([
            '┃IT┃ RADIO ZETA',
            '┃MA┃  CHADA FM',
            '┃MUSIC┃ CHADA FM',
            '┃PT┃ TCV CABO RADIO',
            '┃SYR┃ SYRIA FM',
            '┃TN┃ MOSAIQUE FM',
        ]);
        for (const name of ['RADIO BREMEN TV', 'ICI RADIO-CANADA TELE', 'RADIO ITALIA HD', 'RTL RADIO HD']) {
            expect(claimed.some((c) => c.includes(name)), name).toBe(false);
        }
    });
});

describe("the provider's own radio bundle", () => {
    it('is the 131 stations that leaked into Live', () => {
        expect(stations).toHaveLength(131);
        expect(stations).toContain('NPO RADIO 1');
        expect(stations).toContain('SLAM!');
    });

    it('is recognised as a bundle whatever the category is called', () => {
        // The category name is the one thing the export does not record, so
        // the majority rule has to carry this on its own. It does, with room
        // to spare — which is what makes the fix hold regardless of whether
        // the provider files these under RADIO, MUZIEK, or anything else.
        expect(isRadioGroup('┃NL┃ MUZIEK | ZENDERS', stations)).toBe(true);
        expect(isRadioGroup('┃NL┃ AMUSEMENT', stations)).toBe(true);
        expect(isRadioGroup('Ungrouped', stations)).toBe(true);
    });

    it('leaves a comfortable margin over the majority threshold', () => {
        // Individually, well under half of these names say "radio" or carry a
        // band suffix — the looser group-level hints (OMROEP, ZENDER, …) are
        // what push the bundle over the line, and the margin is what stops a
        // slightly different provider list from falling back under it.
        const share = stations.filter((name) => looksLikeRadioName(name)).length / stations.length;
        expect(share).toBeLessThan(0.75);
        expect(share).toBeGreaterThan(0.35);
    });
});
