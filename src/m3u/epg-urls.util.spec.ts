import { describe, expect, it } from 'vitest';
import { extractM3uEpgUrls } from './epg-urls.util';

/** Ported from thunder-tv's `playlist.utils.spec.ts`'s `extractM3uEpgUrls` cases (Feature 06.1.7), adapted to take the header object directly instead of `{ header }`. */
describe('extractM3uEpgUrls', () => {
    it('extracts and deduplicates playlist-scoped EPG URLs from supported M3U header attributes', () => {
        expect(
            extractM3uEpgUrls({
                attrs: {
                    'x-tvg-url':
                        ' https://example.com/guide.xml, https://example.com/guide.xml https://example.com/extra.xml.gz ',
                    'url-tvg': 'https://example.com/url-tvg.xml',
                },
                raw: '#EXTM3U x-tvg-url="https://example.com/guide.xml" url-tvg="https://example.com/url-tvg.xml"',
            }),
        ).toEqual([
            'https://example.com/guide.xml',
            'https://example.com/extra.xml.gz',
            'https://example.com/url-tvg.xml',
        ]);
    });

    it('falls back to the raw header for tvg-url variants the parser does not expose as attrs', () => {
        expect(
            extractM3uEpgUrls({
                attrs: {},
                raw: '#EXTM3U tvg-url="https://example.com/raw-guide.xml"',
            }),
        ).toEqual(['https://example.com/raw-guide.xml']);
    });

    it('returns an empty array for a missing header', () => {
        expect(extractM3uEpgUrls(null)).toEqual([]);
        expect(extractM3uEpgUrls(undefined)).toEqual([]);
    });

    it('returns an empty array when no EPG header attribute is present', () => {
        expect(extractM3uEpgUrls({ attrs: {}, raw: '#EXTM3U' })).toEqual([]);
    });
});
