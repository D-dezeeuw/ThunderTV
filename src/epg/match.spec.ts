import { describe, expect, it } from 'vitest';
import { groupChannels, type GroupedChannel } from '../channels/grouping';
import { withFakePlatform } from '../core/platform/fake-platform';
import type { EpgCatalogRecord } from '../core/storage';
import type { ChannelRow } from '../m3u/types';
import { loadMapping, matchChannels, matchedCatalogIds, saveMapping, type MatchResult } from './match';

function channel(overrides: Partial<GroupedChannel> = {}): GroupedChannel {
    return {
        key: 'NPO 1',
        name: 'NPO 1',
        primary: { id: 'v1', url: 'http://x/1', label: '', quality: null, isRecording: false, provider: null, tier: 0 },
        variants: [],
        logo: null,
        tvgId: null,
        isKnown: true,
        rank: 100,
        radio: false,
        ...overrides,
    };
}

function catalogEntry(overrides: Partial<EpgCatalogRecord> = {}): EpgCatalogRecord {
    return {
        country: 'NL',
        id: 'NPO 1.nl',
        displayName: 'NPO 1',
        normKey: 'NPO 1',
        icon: null,
        sourceFile: 'netherlands1.xml',
        ...overrides,
    };
}

describe('matchChannels', () => {
    it('matches via tvg-id when the channel carries one that equals a catalog id', () => {
        const ch = channel({ key: 'SOMETHING ELSE', tvgId: 'NPO 1.nl' });
        const catalog = [catalogEntry()];
        const result = matchChannels([ch], catalog);
        expect(result.matches).toEqual([{ channelKey: 'SOMETHING ELSE', catalogId: 'NPO 1.nl', method: 'tvg-id' }]);
    });

    it('matches via normalized name when normKey equals the channel key', () => {
        const ch = channel({ key: 'NPO 1', tvgId: null });
        const result = matchChannels([ch], [catalogEntry()]);
        expect(result.matches).toEqual([{ channelKey: 'NPO 1', catalogId: 'NPO 1.nl', method: 'name' }]);
    });

    it('bridges a feed-side alias spelling to a playlist row already resolved to the canonical (NED 1 -> NPO 1 -> NPO 1.nl)', () => {
        // The feed spells this entry "NED 1.nl" — DUTCH_CATALOG knows "NED 1"
        // (normalizeKey('NED 1') === 'NED 1') as an alias for "NPO 1", so
        // buildNormKeyIndex also indexes it under NPO 1's normKey, which is
        // exactly what grouping.ts already resolved this playlist row's key to.
        const ch = channel({ key: 'NPO 1', tvgId: null });
        const catalog = [catalogEntry({ id: 'NED 1.nl', displayName: 'NED 1', normKey: 'NED 1' })];
        const result = matchChannels([ch], catalog);
        expect(result.matches).toEqual([{ channelKey: 'NPO 1', catalogId: 'NED 1.nl', method: 'alias' }]);
    });

    it('prefers a direct name hit over an alias-bridged one for the same key', () => {
        const ch = channel({ key: 'NPO 1', tvgId: null });
        const catalog = [
            catalogEntry({ id: 'NED 1.nl', displayName: 'NED 1', normKey: 'NED 1' }),
            catalogEntry({ id: 'NPO 1.nl', displayName: 'NPO 1', normKey: 'NPO 1' }),
        ];
        const result = matchChannels([ch], catalog);
        expect(result.matches[0]).toMatchObject({ catalogId: 'NPO 1.nl', method: 'name' });
    });

    it('tvg-id ladder wins over the name ladder when both would match different entries', () => {
        const ch = channel({ key: 'NPO 1', tvgId: 'OTHER.nl' });
        const catalog = [catalogEntry({ id: 'OTHER.nl', displayName: 'Other', normKey: 'OTHER' }), catalogEntry()];
        const result = matchChannels([ch], catalog);
        expect(result.matches[0]).toMatchObject({ catalogId: 'OTHER.nl', method: 'tvg-id' });
    });

    it('a normKey collision is broken deterministically by exact displayName match to the channel name', () => {
        const ch = channel({ key: 'SBS 6', name: 'SBS6', tvgId: null });
        const catalog = [
            catalogEntry({ id: 'SBS-6.nl', displayName: 'SBS-6', normKey: 'SBS 6' }),
            catalogEntry({ id: 'SBS6.nl', displayName: 'SBS6', normKey: 'SBS 6' }),
        ];
        const result = matchChannels([ch], catalog);
        expect(result.matches[0]?.catalogId).toBe('SBS6.nl');
    });

    it('falls back to the lexicographically first id when no candidate matches the channel name exactly', () => {
        const ch = channel({ key: 'SBS 6', name: 'Something Else Entirely', tvgId: null });
        const catalog = [
            catalogEntry({ id: 'Z-SBS.nl', displayName: 'Z SBS', normKey: 'SBS 6' }),
            catalogEntry({ id: 'A-SBS.nl', displayName: 'A SBS', normKey: 'SBS 6' }),
        ];
        const result = matchChannels([ch], catalog);
        expect(result.matches[0]?.catalogId).toBe('A-SBS.nl');
    });

    it('reports unmatched channels and unmatched catalog entries', () => {
        const known = channel({ key: 'NPO 1' });
        const unknown = channel({ key: 'SOME UNKNOWN CHANNEL', tvgId: null });
        const catalog = [catalogEntry(), catalogEntry({ id: 'RTL 4.nl', displayName: 'RTL 4', normKey: 'RTL 4' })];

        const result = matchChannels([known, unknown], catalog);
        expect(result.unmatchedChannels).toEqual(['SOME UNKNOWN CHANNEL']);
        expect(result.unmatchedCatalog).toEqual(['RTL 4.nl']);
    });

    it('is deterministic regardless of input channel order', () => {
        const a = channel({ key: 'A CHANNEL', name: 'A', tvgId: null });
        const b = channel({ key: 'B CHANNEL', name: 'B', tvgId: null });
        const catalog = [
            catalogEntry({ id: 'a.nl', displayName: 'A', normKey: 'A CHANNEL' }),
            catalogEntry({ id: 'b.nl', displayName: 'B', normKey: 'B CHANNEL' }),
        ];

        const forward = matchChannels([a, b], catalog);
        const shuffled = matchChannels([b, a], catalog);
        expect(forward.matches).toEqual(shuffled.matches);
    });

    it('completes well under budget for a larger synthetic input (Feature 31.5.7)', () => {
        const channels = Array.from({ length: 3000 }, (_, i) => channel({ key: `CH ${String(i)}`, name: `CH ${String(i)}`, tvgId: null }));
        const catalog = Array.from({ length: 2000 }, (_, i) => catalogEntry({ id: `ch${String(i)}.nl`, displayName: `CH ${String(i)}`, normKey: `CH ${String(i)}` }));

        const start = performance.now();
        const result = matchChannels(channels, catalog);
        expect(performance.now() - start).toBeLessThan(50);
        expect(result.matches).toHaveLength(2000);
    });
});

describe('match-quality fixture (Feature 31.5.10 — a realistic NL provider dump against a realistic feed)', () => {
    function row(name: string, group: string | null = '| NL | ODIDO HD'): ChannelRow {
        return { id: name, name, url: `http://x/${name}`, group, logo: null, tvgId: null, radio: false };
    }

    it('matches at least 90% of the curated catalog when provider spellings differ from feed ids', () => {
        // Real-world provider spellings (mixed HD/FHD markers, RTL/SBS
        // spacing quirks) — exactly what `dutch-catalog.ts`'s aliases and
        // grouping.ts's identity resolution exist to normalize.
        const rows: ChannelRow[] = [
            row('| NL | NPO 1 HD'),
            row('| NL | NPO 2 FHD'),
            row('| NL | NPO 3 HD'),
            row('| NL | RTL 4 HD'),
            row('| NL | RTL 5 FHD'),
            row('| NL | SBS6 HD'),
            row('| NL | NET 5 HD'),
            row('| NL | VERONICA DISNEY XD HD'),
            row('| NL | DISCOVERY HD'),
            row('| NL | 24 KITCHEN HD'),
        ];
        const { channels } = groupChannels(rows, { country: 'NL' });

        // The feed's own ids — following the real globetvapp/epg convention
        // (`"<name>.<suffix>"`), spelled independently of the provider dump.
        const catalog: EpgCatalogRecord[] = [
            'NPO 1',
            'NPO 2',
            'NPO 3',
            'RTL 4',
            'RTL 5',
            'SBS6',
            'Net5',
            'Veronica',
            'Discovery Channel',
            '24Kitchen',
        ].map((displayName) => ({
            country: 'NL',
            id: `${displayName}.nl`,
            displayName,
            normKey: displayName.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
            icon: null,
            sourceFile: 'netherlands1.xml',
        }));

        const result = matchChannels(channels, catalog);
        const rate = result.matches.length / channels.length;
        expect(rate).toBeGreaterThanOrEqual(0.9);
    });
});

describe('matchedCatalogIds', () => {
    it('returns the set of matched catalog ids', () => {
        const result: MatchResult = {
            matches: [
                { channelKey: 'a', catalogId: 'x.nl', method: 'name' },
                { channelKey: 'b', catalogId: 'y.nl', method: 'tvg-id' },
            ],
            unmatchedChannels: [],
            unmatchedCatalog: [],
        };
        expect(matchedCatalogIds(result)).toEqual(new Set(['x.nl', 'y.nl']));
    });
});

describe('saveMapping / loadMapping', () => {
    it('round-trips the matches through storage, keyed per country', async () => {
        await withFakePlatform({}, async () => {
            const result: MatchResult = {
                matches: [{ channelKey: 'NPO 1', catalogId: 'NPO 1.nl', method: 'name' }],
                unmatchedChannels: [],
                unmatchedCatalog: [],
            };
            await saveMapping('NL', result);
            expect(await loadMapping('NL')).toEqual(result.matches);
            expect(await loadMapping('DE')).toEqual([]);
        });
    });

    it('loadMapping resolves an empty array when nothing was ever saved', async () => {
        await withFakePlatform({}, async () => {
            expect(await loadMapping('NL')).toEqual([]);
        });
    });
});
