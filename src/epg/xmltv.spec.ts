import { describe, expect, it } from 'vitest';
import {
    matchXmltvChannels,
    normalizeChannelName,
    parseXmltvDocument,
    parseXmltvTimestamp,
    toEpgRecords,
} from './xmltv';

describe('epg/xmltv', () => {
    describe('parseXmltvTimestamp', () => {
        it('parses a zero-offset timestamp straight to the same UTC instant', () => {
            expect(parseXmltvTimestamp('20251025210000 +0000')).toBe(Date.UTC(2025, 9, 25, 21, 0, 0));
        });

        it('subtracts a positive offset to land on the correct UTC instant', () => {
            // 21:00 local at UTC+2 is 19:00 UTC.
            expect(parseXmltvTimestamp('20251025210000 +0200')).toBe(Date.UTC(2025, 9, 25, 19, 0, 0));
        });

        it('adds back a negative offset to land on the correct UTC instant', () => {
            // 21:00 local at UTC-0500 is 02:00 UTC the next day.
            expect(parseXmltvTimestamp('20251025210000 -0500')).toBe(Date.UTC(2025, 9, 26, 2, 0, 0));
        });

        it('treats a missing offset as already UTC', () => {
            expect(parseXmltvTimestamp('20251025210000')).toBe(Date.UTC(2025, 9, 25, 21, 0, 0));
        });

        it('returns null for a malformed timestamp', () => {
            expect(parseXmltvTimestamp('not-a-timestamp')).toBeNull();
        });
    });

    describe('parseXmltvDocument', () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="test" generator-info-url="https://www.open-epg.com">
  <channel id="24 Kitchen.nl">
    <display-name>24 Kitchen.nl</display-name>
    <icon src="https://example.com/24kitchen.png" />
  </channel>
  <channel id="Bad Channel">
    <!-- missing display-name: dropped -->
  </channel>
  <programme start="20251025210000 +0000" stop="20251026010000 +0000" channel="24 Kitchen.nl">
    <title>Cooking Show</title>
    <desc>A cooking show.</desc>
  </programme>
  <programme start="not-a-timestamp" stop="20251026010000 +0000" channel="24 Kitchen.nl">
    <title>Bad Programme</title>
  </programme>
</tv>`;

        it('extracts well-formed channels and drops ones missing required fields', () => {
            const { channels } = parseXmltvDocument(xml);
            expect(channels).toEqual([{ id: '24 Kitchen.nl', displayName: '24 Kitchen.nl', icon: 'https://example.com/24kitchen.png' }]);
        });

        it('extracts well-formed programmes and drops ones with an unparseable timestamp', () => {
            const { programs } = parseXmltvDocument(xml);
            expect(programs).toEqual([
                {
                    channelId: '24 Kitchen.nl',
                    start: Date.UTC(2025, 9, 25, 21, 0, 0),
                    stop: Date.UTC(2025, 9, 26, 1, 0, 0),
                    title: 'Cooking Show',
                    description: 'A cooking show.',
                },
            ]);
        });
    });

    describe('normalizeChannelName', () => {
        it('trims and lowercases', () => {
            expect(normalizeChannelName('  24 Kitchen.NL  ')).toBe('24 kitchen.nl');
        });
    });

    describe('matchXmltvChannels', () => {
        const xmltvChannels = [
            { id: '24 Kitchen.nl', displayName: '24 Kitchen.nl', icon: null },
            { id: 'NPO 1.nl', displayName: 'NPO 1', icon: null },
            { id: 'Unrelated.nl', displayName: 'Some Foreign Channel', icon: null },
        ];

        it('matches by exact tvgId/epgChannelId', () => {
            const matched = matchXmltvChannels(xmltvChannels, [{ tvgId: '24 Kitchen.nl', name: 'Something Else' }]);
            expect(matched).toEqual(new Set(['24 Kitchen.nl']));
        });

        it('falls back to a normalized display-name match when the id does not match', () => {
            const matched = matchXmltvChannels(xmltvChannels, [{ tvgId: null, name: '  npo 1  ' }]);
            expect(matched).toEqual(new Set(['NPO 1.nl']));
        });

        it('returns an empty set when nothing matches either way', () => {
            const matched = matchXmltvChannels(xmltvChannels, [{ tvgId: 'x', name: 'Totally Different' }]);
            expect(matched.size).toBe(0);
        });
    });

    describe('toEpgRecords', () => {
        it('keeps only the matched subset of channels and programs', () => {
            const doc = {
                channels: [
                    { id: 'a', displayName: 'A', icon: null },
                    { id: 'b', displayName: 'B', icon: null },
                ],
                programs: [
                    { channelId: 'a', start: 1, stop: 2, title: 'A show', description: null },
                    { channelId: 'b', start: 3, stop: 4, title: 'B show', description: null },
                ],
            };
            const result = toEpgRecords(doc, new Set(['a']));
            expect(result.channels).toEqual([{ id: 'a', displayName: 'A', icon: null }]);
            expect(result.programs).toEqual([{ channelId: 'a', start: 1, stop: 2, title: 'A show', description: null }]);
        });
    });
});
