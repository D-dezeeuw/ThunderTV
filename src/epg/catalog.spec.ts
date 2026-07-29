import { describe, expect, it } from 'vitest';
import type { EpgCountry } from './countries';
import { deriveCatalog, type ParsedFeedFile } from './catalog';
import { parseXmltvDocument } from './xmltv';

const NL: EpgCountry = {
    folder: 'Netherlands',
    filePrefix: 'netherlands',
    fileCount: 2,
    suffix: 'nl',
    iso2: 'NL',
    name: 'Netherlands',
    kind: 'country',
};

const DE: EpgCountry = { ...NL, folder: 'Germany', filePrefix: 'germany', suffix: 'de', iso2: 'DE', name: 'Germany' };

function file(sourceFile: string, xml: string): ParsedFeedFile {
    return { sourceFile, document: parseXmltvDocument(xml) };
}

describe('deriveCatalog', () => {
    it('strips the country suffix into displayName and normalizes into normKey', () => {
        const xml = `<tv><channel id="24 Kitchen.nl"><display-name>24 Kitchen.nl</display-name></channel></tv>`;
        const { entries } = deriveCatalog('NL', NL, [file('netherlands1.xml', xml)]);

        expect(entries).toEqual([
            {
                country: 'NL',
                id: '24 Kitchen.nl',
                displayName: '24 Kitchen',
                normKey: '24 KITCHEN',
                icon: null,
                sourceFile: 'netherlands1.xml',
            },
        ]);
    });

    it('handles a dot-bearing id, stripping only the registered suffix at the end', () => {
        const xml = `<tv><channel id="1-2-3.tv.de"><display-name>1-2-3.tv.de</display-name></channel></tv>`;
        const { entries } = deriveCatalog('DE', DE, [file('germany1.xml', xml)]);
        expect(entries[0]).toMatchObject({ id: '1-2-3.tv.de', displayName: '1-2-3.tv' });
    });

    it('carries the icon through when present', () => {
        const xml = `<tv><channel id="BBC One.uk"><display-name>BBC One.uk</display-name><icon src="https://example.com/bbc.png"/></channel></tv>`;
        const { entries } = deriveCatalog('NL', NL, [file('netherlands1.xml', xml)]);
        expect(entries[0]?.icon).toBe('https://example.com/bbc.png');
    });

    it('dedupes a channel id that appears in a later file — first occurrence wins, counted in stats.deduped', () => {
        const xml1 = `<tv><channel id="NPO 1.nl"><display-name>NPO 1.nl</display-name></channel></tv>`;
        const xml2 = `<tv><channel id="NPO 1.nl"><display-name>DIFFERENT.nl</display-name></channel></tv>`;
        const { entries, stats } = deriveCatalog('NL', NL, [file('netherlands1.xml', xml1), file('netherlands2.xml', xml2)]);

        expect(entries).toHaveLength(1);
        expect(entries[0]?.sourceFile).toBe('netherlands1.xml');
        expect(stats.deduped).toBe(1);
    });

    it('keeps two distinct ids that share a normKey (Feature 31.3.5 — the matcher owns collision handling)', () => {
        const xml = `<tv>
            <channel id="SBS-6.nl"><display-name>SBS-6.nl</display-name></channel>
            <channel id="SBS 6.nl"><display-name>SBS 6.nl</display-name></channel>
        </tv>`;
        const { entries } = deriveCatalog('NL', NL, [file('netherlands1.xml', xml)]);
        expect(entries).toHaveLength(2);
        expect(new Set(entries.map((e) => e.normKey))).toEqual(new Set(['SBS 6']));
    });

    it('a file that parses to zero channels contributes nothing and does not error', () => {
        const { entries, stats } = deriveCatalog('NL', NL, [file('netherlands1.xml', '<tv></tv>')]);
        expect(entries).toEqual([]);
        expect(stats.files).toBe(1);
        expect(stats.entries).toBe(0);
    });

    it('skips an id that is nothing but the country suffix (degenerate strip)', () => {
        const xml = `<tv><channel id=".nl"><display-name>.nl</display-name></channel></tv>`;
        const { entries, stats } = deriveCatalog('NL', NL, [file('netherlands1.xml', xml)]);
        expect(entries).toEqual([]);
        expect(stats.skipped).toBe(1);
    });

    it('reports files/entries/deduped/skipped stats accurately across a multi-file batch', () => {
        const xml1 = `<tv>
            <channel id="A.nl"><display-name>A.nl</display-name></channel>
            <channel id="B.nl"><display-name>B.nl</display-name></channel>
        </tv>`;
        const xml2 = `<tv>
            <channel id="A.nl"><display-name>A.nl</display-name></channel>
            <channel id="C.nl"><display-name>C.nl</display-name></channel>
        </tv>`;
        const { stats } = deriveCatalog('NL', NL, [file('netherlands1.xml', xml1), file('netherlands2.xml', xml2)]);
        expect(stats).toEqual({ files: 2, entries: 3, deduped: 1, skipped: 0 });
    });

    it('stores the app-facing live token as `country`, not the registry folder name', () => {
        const xml = `<tv><channel id="BBC One.uk"><display-name>BBC One.uk</display-name></channel></tv>`;
        const UK: EpgCountry = { ...NL, folder: 'Unitedkingdom', filePrefix: 'unitedkingdom', suffix: 'uk', iso2: 'GB' };
        const { entries } = deriveCatalog('UK', UK, [file('unitedkingdom1.xml', xml)]);
        expect(entries[0]?.country).toBe('UK');
    });
});
