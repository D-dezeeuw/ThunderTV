import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import type { EpgCatalogRecord } from '../core/storage';
import { getCountryCatalog, replaceCountryCatalog } from './catalog-storage';

function entry(country: string, id: string, overrides: Partial<EpgCatalogRecord> = {}): EpgCatalogRecord {
    return { country, id, displayName: id, normKey: id.toUpperCase(), icon: null, sourceFile: 'f1.xml', ...overrides };
}

describe('replaceCountryCatalog / getCountryCatalog', () => {
    it('writes and reads back a country scoped by [country, id]', async () => {
        await withFakePlatform({}, async () => {
            await replaceCountryCatalog('NL', [entry('NL', 'a.nl'), entry('NL', 'b.nl')]);
            const rows = await getCountryCatalog('NL');
            expect(rows.map((r) => r.id).sort()).toEqual(['a.nl', 'b.nl']);
        });
    });

    it('never touches another country\'s rows', async () => {
        await withFakePlatform({}, async () => {
            await replaceCountryCatalog('NL', [entry('NL', 'a.nl')]);
            await replaceCountryCatalog('DE', [entry('DE', 'x.de')]);

            expect((await getCountryCatalog('NL')).map((r) => r.id)).toEqual(['a.nl']);
            expect((await getCountryCatalog('DE')).map((r) => r.id)).toEqual(['x.de']);
        });
    });

    it('a re-derive with a shrunken set drops the entries no longer present (Feature 31.4.4)', async () => {
        await withFakePlatform({}, async () => {
            await replaceCountryCatalog('NL', [entry('NL', 'a.nl'), entry('NL', 'b.nl'), entry('NL', 'c.nl')]);
            await replaceCountryCatalog('NL', [entry('NL', 'a.nl')]);

            expect((await getCountryCatalog('NL')).map((r) => r.id)).toEqual(['a.nl']);
        });
    });

    it('replacing with an empty set clears the country entirely', async () => {
        await withFakePlatform({}, async () => {
            await replaceCountryCatalog('NL', [entry('NL', 'a.nl')]);
            await replaceCountryCatalog('NL', []);
            expect(await getCountryCatalog('NL')).toEqual([]);
        });
    });

    it('a re-derive updates a changed field on an id that persists across both writes', async () => {
        await withFakePlatform({}, async () => {
            await replaceCountryCatalog('NL', [entry('NL', 'a.nl', { displayName: 'Old Name' })]);
            await replaceCountryCatalog('NL', [entry('NL', 'a.nl', { displayName: 'New Name' })]);

            const rows = await getCountryCatalog('NL');
            expect(rows).toEqual([expect.objectContaining({ id: 'a.nl', displayName: 'New Name' })]);
        });
    });
});
