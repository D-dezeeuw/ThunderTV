import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseM3u } from './parse-m3u';

// The jsdom test environment overrides the global `URL` with its own
// polyfill, which resolves a relative `new URL(rel, base)` against jsdom's
// fake `http://localhost:3000/` origin instead of a real `file://` base —
// even when `base` genuinely is a `file://` URL. Importing `URL` explicitly
// from `node:url` sidesteps jsdom's global override.
const fixturesDir = fileURLToPath(new NodeURL('../../tests/fixtures/m3u', import.meta.url));

function readFixture(name: string): string {
    return readFileSync(`${fixturesDir}/${name}`, 'utf8');
}

describe('parseM3u', () => {
    it('never throws — a missing #EXTM3U header resolves { ok: false } instead (Feature 06.7.2)', () => {
        expect(() => parseM3u('not a playlist at all')).not.toThrow();
        const result = parseM3u('not a playlist at all');
        expect(result).toEqual({ ok: false, reason: 'no-header' });
    });

    it('parses a well-formed playlist successfully', () => {
        const result = parseM3u('#EXTM3U\n#EXTINF:-1,Channel One\nhttps://example.com/1.m3u8\n');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.playlist.items).toHaveLength(1);
    });

    it('survives header attribute round-trip through header.attrs (Feature 06.2.5)', () => {
        const result = parseM3u(
            '#EXTM3U x-tvg-url="https://example.com/guide.xml.gz"\n#EXTINF:-1,One\nhttps://example.com/1.m3u8\n',
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.playlist.header.attrs['x-tvg-url']).toBe('https://example.com/guide.xml.gz');
        expect(result.playlist.header.raw).toContain(
            'x-tvg-url="https://example.com/guide.xml.gz"',
        );
    });

    it('preserves #KODIPROP lines between #EXTINF and the URL in item.raw (Feature 06.2.6)', () => {
        const m3u = [
            '#EXTM3U',
            '#EXTINF:-1,Encrypted',
            '#KODIPROP:inputstream.adaptive.license_type=clearkey',
            '#KODIPROP:inputstream.adaptive.license_key=abc:def',
            'https://example.com/enc.mpd',
            '',
        ].join('\n');

        const result = parseM3u(m3u);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const [item] = result.playlist.items;
        expect(item?.raw).toContain('#KODIPROP:inputstream.adaptive.license_type=clearkey');
        expect(item?.raw).toContain('#KODIPROP:inputstream.adaptive.license_key=abc:def');
    });

    it('parses the ported thunder-tv sample playlist fixture with the expected item count and fields (Feature 06.2.7)', () => {
        const result = parseM3u(readFixture('sample.m3u'));
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.playlist.items).toHaveLength(4);
        expect(result.playlist.header.attrs['url-tvg']).toBe('http://xml-url/path/full.xml.gz');

        // The fork's getName() does not trim the parsed name — the fixture's
        // "...," Channel 1" (a space after the comma, verbatim from
        // thunder-tv's source fixture) parses with a leading space. The
        // mapper (channel-mapper.ts) trims it; this spec asserts the raw
        // wrapper output, so it trims here for the comparison instead.
        const [first, second, third, fourth] = result.playlist.items;
        expect(first?.tvg.id).toBe('1');
        expect(first?.group.title).toBe('News');
        expect(first?.name.trim()).toBe('Channel 1');
        expect(second?.name.trim()).toBe('Positive News TV');
        expect(third?.group.title).toBe('Sport');
        expect(fourth?.name.trim()).toBe('HappyKids TV');
        expect(fourth?.group.title).toBe('Kids');
    });
});
