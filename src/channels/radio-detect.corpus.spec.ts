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

const categories = loadCategories();

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
