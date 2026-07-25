import { describe, expect, it } from 'vitest';
import { mapItemToChannelRow } from './channel-mapper';
import { parseM3u } from './parse-m3u';

/** Parses `m3u` and maps every item, asserting the parse itself succeeded — the fixture-driven pattern every spec in this file uses instead of hand-building `PlaylistItem` objects. */
function mapAll(m3u: string) {
    const result = parseM3u(m3u);
    if (!result.ok) throw new Error('fixture failed to parse');
    return result.playlist.items.map(mapItemToChannelRow);
}

describe('mapItemToChannelRow', () => {
    it('maps a fully-attributed item to a flat ChannelRow (Feature 06.5.1/06.5.4)', () => {
        const [row] = mapAll(
            '#EXTM3U\n#EXTINF:-1 tvg-id="ch1" tvg-logo="http://x/1.png" group-title="News",Channel One\nhttps://example.channels/1.m3u8\n',
        );

        expect(typeof row?.id).toBe('string');
        expect(row?.id.length).toBeGreaterThan(0);
        expect(row?.name).toBe('Channel One');
        expect(row?.url).toBe('https://example.channels/1.m3u8');
        expect(row?.group).toBe('News');
        expect(row?.logo).toBe('http://x/1.png');
        expect(row?.tvgId).toBe('ch1');
        expect(row?.radio).toBe(false);
    });

    it('drops rows without a stream URL, returning null (Feature 06.7.5)', () => {
        const rows = mapAll('#EXTM3U\n#EXTINF:-1 tvg-id="trailing",Trailing Channel With No URL');
        expect(rows).toEqual([null]);
    });

    it('falls back to the URL filename when the #EXTINF line has no comma/name (Feature 06.7.4)', () => {
        const [row] = mapAll(
            '#EXTM3U\n#EXTINF:-1 tvg-id="1"\nhttps://example.channels/no-name.m3u8\n',
        );
        expect(row?.name).toBe('no-name.m3u8');
    });

    it('normalizes a missing group-title to null, not an empty string (Feature 06.5.8)', () => {
        const [row] = mapAll(
            '#EXTM3U\n#EXTINF:-1,Ungrouped Channel\nhttps://example.channels/1.m3u8\n',
        );
        expect(row?.group).toBeNull();
    });

    it('normalizes a missing tvg-logo to null (Feature 06.5.8)', () => {
        const [row] = mapAll(
            '#EXTM3U\n#EXTINF:-1,No Logo Channel\nhttps://example.channels/1.m3u8\n',
        );
        expect(row?.logo).toBeNull();
    });

    it('normalizes a missing tvg-id to null (Feature 06.5.8)', () => {
        const [row] = mapAll('#EXTM3U\n#EXTINF:-1,No Tvg Id\nhttps://example.channels/1.m3u8\n');
        expect(row?.tvgId).toBeNull();
    });

    it('mints a fresh id per row, stable across the returned object (Feature 06.5.3)', () => {
        const rows = mapAll(
            '#EXTM3U\n#EXTINF:-1,One\nhttps://example.channels/1.m3u8\n#EXTINF:-1,Two\nhttps://example.channels/2.m3u8\n',
        );
        expect(rows[0]?.id).not.toBe(rows[1]?.id);
    });

    describe('DRM extraction (Feature 06.8.2/06.8.8)', () => {
        it('attaches drm when #KODIPROP ClearKey lines are present', () => {
            const kid = '9eb4050de44b4802932e27d75083e266';
            const key = '166634c675823c235a4a9446fad52e4d';
            const [row] = mapAll(
                [
                    '#EXTM3U',
                    '#EXTINF:-1,Encrypted DASH',
                    '#KODIPROP:inputstream.adaptive.license_type=clearkey',
                    `#KODIPROP:inputstream.adaptive.license_key=${kid}:${key}`,
                    'https://example.com/enc.mpd',
                    '',
                ].join('\n'),
            );

            expect(row?.drm).toEqual({
                licenseType: 'clearkey',
                supported: true,
                clearKeys: { [kid]: key },
            });
        });

        it('leaves drm undefined for a plain channel, and never carries raw M3U text on the row', () => {
            const [row] = mapAll('#EXTM3U\n#EXTINF:-1,Plain HLS\nhttps://example.com/live.m3u8\n');
            expect(row?.drm).toBeUndefined();
            expect('drm' in (row ?? {})).toBe(false);
            expect(row).not.toHaveProperty('raw');
        });
    });

    describe('radio flag normalization (Feature 06.9.2/06.9.9)', () => {
        it.each(['true', 'True', 'TRUE'])('treats radio="%s" as true', (value) => {
            const [row] = mapAll(
                `#EXTM3U\n#EXTINF:-1 radio="${value}",Radio Station\nhttps://example.com/radio.m3u8\n`,
            );
            expect(row?.radio).toBe(true);
        });

        it.each(['false', '', 'yes'])('treats radio="%s" (or absent) as false', (value) => {
            const [row] = mapAll(
                `#EXTM3U\n#EXTINF:-1 radio="${value}",TV Channel\nhttps://example.com/tv.m3u8\n`,
            );
            expect(row?.radio).toBe(false);
        });

        it('detects radio="true" regardless of position relative to tvg-* attributes', () => {
            const before = mapAll(
                '#EXTM3U\n#EXTINF:-1 radio="true" tvg-id="r1",Radio Before\nhttps://example.com/r1.m3u8\n',
            );
            const after = mapAll(
                '#EXTM3U\n#EXTINF:-1 tvg-id="r2" radio="true",Radio After\nhttps://example.com/r2.m3u8\n',
            );
            expect(before[0]?.radio).toBe(true);
            expect(after[0]?.radio).toBe(true);
        });

        it('detects a mixed TV+radio playlist correctly per row', () => {
            const rows = mapAll(
                [
                    '#EXTM3U',
                    '#EXTINF:-1,TV One',
                    'https://example.com/tv1.m3u8',
                    '#EXTINF:-1 radio="true",Radio One',
                    'https://example.com/radio1.m3u8',
                    '#EXTINF:-1,TV Two',
                    'https://example.com/tv2.m3u8',
                    '',
                ].join('\n'),
            );
            expect(rows.map((r) => r?.radio)).toEqual([false, true, false]);
        });
    });
});
