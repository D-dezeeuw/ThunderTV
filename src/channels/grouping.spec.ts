import { describe, expect, it } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { groupChannels, toDisplayRows } from './grouping';
import { classifyJunk } from './junk-filter';
import { parseCategoryName, parseChannelName } from './name-parse';

function row(name: string, group: string | null = '| NL | ENTERTAINMENT', id = name): ChannelRow {
    return { id, name, url: `http://x/${encodeURIComponent(id)}.ts`, group, logo: null, tvgId: null, radio: false };
}

describe('parseChannelName', () => {
    it('splits the reported format: country prefix, base, quality, recording flag', () => {
        expect(parseChannelName('| NL | NPO 1 HD rec')).toMatchObject({
            country: 'NL',
            base: 'NPO 1',
            quality: 'HD',
            isRecording: true,
        });
    });

    it('handles the punctuation variants providers actually ship', () => {
        expect(parseChannelName('NL: RTL 4 FHD')).toMatchObject({ country: 'NL', base: 'RTL 4', quality: 'FHD' });
        expect(parseChannelName('[NL] SBS 6 SD')).toMatchObject({ country: 'NL', base: 'SBS 6', quality: 'SD' });
        expect(parseChannelName('NL - Ziggo Sport 4K')).toMatchObject({ country: 'NL', base: 'Ziggo Sport', quality: 'UHD' });
        expect(parseChannelName('| NL | VTM ᴴᴰ')).toMatchObject({ country: 'NL', base: 'VTM', quality: 'HD' });
    });

    it('does not mistake FHD for HD, nor a country token inside a word', () => {
        expect(parseChannelName('| NL | NPO 1 FHD').quality).toBe('FHD');
        // "FINLAND" must not be read as a country prefix and shredded.
        expect(parseChannelName('FINLAND NEWS').country).toBeNull();
    });

    it('strips codec/delivery noise so one channel does not split into several groups', () => {
        expect(parseChannelName('| NL | NPO 1 H265').base).toBe('NPO 1');
        expect(parseChannelName('| NL | NPO 1 HD BACKUP').base).toBe('NPO 1');
    });

    it('never returns an empty base — a marker-only name keeps its raw text', () => {
        const parsed = parseChannelName('| NL | HD');
        expect(parsed.base.length).toBeGreaterThan(0);
    });

    it('parseCategoryName pulls the country off a category label', () => {
        expect(parseCategoryName('| NL | ENTERTAINMENT')).toEqual({ country: 'NL', label: 'ENTERTAINMENT' });
        expect(parseCategoryName('SPORTS')).toEqual({ country: null, label: 'SPORTS' });
    });
});

describe('classifyJunk', () => {
    it('flags numbered event slots (the Viaplay-style dead weight)', () => {
        expect(classifyJunk(parseChannelName('| NL | VIAPLAY 07')).isJunk).toBe(true);
        expect(classifyJunk(parseChannelName('| NL | PPV 12')).isJunk).toBe(true);
    });

    it('keeps real branded channels that merely contain a number', () => {
        expect(classifyJunk(parseChannelName('| NL | VIAPLAY TV')).isJunk).toBe(false);
        expect(classifyJunk(parseChannelName('| NL | NPO 1')).isJunk).toBe(false);
        expect(classifyJunk(parseChannelName('| NL | RTL 4')).isJunk).toBe(false);
    });

    it('flags separators, explicit dummies and adult rows', () => {
        expect(classifyJunk(parseChannelName('#######')).isJunk).toBe(true);
        expect(classifyJunk(parseChannelName('| NL | TEST CHANNEL')).isJunk).toBe(true);
        expect(classifyJunk(parseChannelName('| NL | XXX PLAYBOY')).isJunk).toBe(true);
    });
});

describe('groupChannels', () => {
    it('collapses quality/catch-up/provider variants of one channel into a single row', () => {
        const { channels, stats } = groupChannels(
            [
                row('| NL | NPO 1 HD', '| NL | ENTERTAINMENT', 'a'),
                row('| NL | NPO 1 FHD', '| NL | ENTERTAINMENT', 'b'),
                row('| NL | NPO 1 HD rec', '| NL | ENTERTAINMENT', 'c'),
                row('| NL | NPO 1', '| NL | ODIDO HD', 'd'),
            ],
            { country: 'NL' },
        );

        expect(channels).toHaveLength(1);
        const npo = channels[0];
        expect(npo?.name).toBe('NPO 1');
        expect(npo?.variants).toHaveLength(4);
        expect(stats.collapsedVariants).toBe(3);
        // Best live quality leads; catch-up sinks to the bottom.
        expect(npo?.primary.quality).toBe('FHD');
        expect(npo?.variants.at(-1)?.isRecording).toBe(true);
        // The bundle variant is tagged with its provider so it is distinguishable.
        expect(npo?.variants.some((v) => v.provider === 'ODIDO')).toBe(true);
    });

    it('labels variants by quality, and only names the category when it carries information', () => {
        const { channels } = groupChannels(
            [
                row('| NL | NPO 1 FHD', '| NL | ENTERTAINMENT', 'a'),
                row('| NL | NPO 1 HD', '| NL | ENTERTAINMENT', 'b'),
                row('| NL | NPO 1', '| NL | ODIDO HD', 'c'),
                row('| NL | NPO 1 HD rec', '| NL | ENTERTAINMENT', 'd'),
            ],
            { country: 'NL' },
        );

        // A plain genre category is noise ("FHD · ENTERTAINMENT" tells the
        // viewer nothing); a bundle names a feed that has no quality marker.
        expect(channels[0]?.variants.map((v) => v.label)).toEqual(['FHD', 'HD', 'ODIDO', 'HD · catch-up']);
    });

    it('disambiguates feeds that would otherwise render identically', () => {
        const { channels } = groupChannels(
            [
                row('| NL | NPO 1 HD', '| NL | ENTERTAINMENT', 'a'),
                row('| NL | NPO 1 HD', '| NL | ODIDO HD', 'b'),
                row('| NL | NPO 1 HD', '| NL | ENTERTAINMENT', 'c'),
            ],
            { country: 'NL' },
        );

        const labels = channels[0]?.variants.map((v) => v.label) ?? [];
        // Two identical chips would be a worse switcher than a verbose one.
        expect(new Set(labels).size).toBe(labels.length);
        expect(labels).toContain('HD · ODIDO');
    });

    it('keeps only the requested country, using the category when the row has no prefix', () => {
        const { channels, stats } = groupChannels(
            [
                row('| NL | NPO 1', '| NL | ENTERTAINMENT', 'a'),
                row('| UK | BBC One', '| UK | ENTERTAINMENT', 'b'),
                row('Discovery Channel', '| NL | DOCU', 'c'),
            ],
            { country: 'NL' },
        );
        expect(channels.map((c) => c.name)).toEqual(['NPO 1', 'Discovery Channel']);
        expect(stats.droppedByCountry).toBe(1);
    });

    it('orders known channels in broadcast order and unknown ones after, alphabetically', () => {
        const { channels } = groupChannels(
            [
                row('| NL | Zeldzame Zender', '| NL | MISC', 'z'),
                row('| NL | RTL 4', '| NL | ENTERTAINMENT', 'r'),
                row('| NL | NPO 1', '| NL | ENTERTAINMENT', 'n'),
                row('| NL | Andere Zender', '| NL | MISC', 'a'),
            ],
            { country: 'NL' },
        );
        expect(channels.map((c) => c.name)).toEqual(['NPO 1', 'RTL 4', 'Andere Zender', 'Zeldzame Zender']);
    });

    it('resolves catalog aliases to one canonical channel', () => {
        const { channels } = groupChannels(
            [row('| NL | NPO1 HD', '| NL | TV', 'a'), row('| NL | Nederland 1 SD', '| NL | TV', 'b')],
            { country: 'NL' },
        );
        expect(channels).toHaveLength(1);
        expect(channels[0]?.name).toBe('NPO 1');
    });

    it('keeps unknown channels by default and drops them only in strict mode', () => {
        const rows = [row('| NL | NPO 1', '| NL | TV', 'a'), row('| NL | Obscure Local TV', '| NL | TV', 'b')];
        expect(groupChannels(rows, { country: 'NL' }).channels).toHaveLength(2);

        const strict = groupChannels(rows, { country: 'NL', knownOnly: true });
        expect(strict.channels.map((c) => c.name)).toEqual(['NPO 1']);
        expect(strict.stats.droppedAsUnknown).toBe(1);
    });

    it('toDisplayRows yields one playable row per channel, carrying its variants', () => {
        const { channels } = groupChannels(
            [row('| NL | NPO 1 HD', '| NL | TV', 'a'), row('| NL | NPO 1 FHD', '| NL | TV', 'b')],
            { country: 'NL' },
        );
        const rows = toDisplayRows(channels);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.name).toBe('NPO 1');
        expect(rows[0]?.url).toBe(channels[0]?.primary.url);
        expect(rows[0]?.variants).toHaveLength(2);
    });
});

describe('radio partitioning', () => {
    function radioRow(name: string, id: string): ChannelRow {
        return { ...row(name, '| NL | RADIO', id), radio: true };
    }

    const MIXED: ChannelRow[] = [
        row('| NL | NPO 1 HD', '| NL | ENTERTAINMENT', 'tv1'),
        radioRow('| NL | Radio 538', 'r1'),
        radioRow('| NL | Sky Radio HD', 'r2'),
    ];

    it('keeps radio out of the TV list and TV out of the radio list', () => {
        expect(groupChannels(MIXED, { country: 'NL' }).channels.map((c) => c.name)).toEqual(['NPO 1']);
        // "Sky Radio HD" keeps its quality marker as a variant, same as TV.
        expect(groupChannels(MIXED, { country: 'NL', radio: 'only' }).channels.map((c) => c.name)).toEqual([
            'Radio 538',
            'Sky Radio',
        ]);
    });

    it('marks radio rows so the player can pick its audio layout', () => {
        const rows = toDisplayRows(groupChannels(MIXED, { country: 'NL', radio: 'only' }).channels);
        expect(rows.every((r) => r.radio)).toBe(true);
        expect(toDisplayRows(groupChannels(MIXED, { country: 'NL' }).channels).every((r) => !r.radio)).toBe(true);
    });

    it('never applies the TV catalog to radio — strict mode would otherwise empty the list', () => {
        const strict = groupChannels(MIXED, { country: 'NL', radio: 'only', knownOnly: true });
        expect(strict.channels).toHaveLength(2);
    });
});

describe('curated Dutch catalog', () => {
    it('resolves the exact requested channel list, aliases included', () => {
        const { channels } = groupChannels(
            [
                row('| NL | NPO 1 HD', '| NL | TV', '1'),
                row('| NL | SBS 6 HD', '| NL | TV', '2'),
                row('| NL | TV538', '| NL | TV', '3'),
                row('| NL | Disney Jr HD', '| NL | TV', '4'),
                row('| NL | VIAPLAY TV', '| NL | TV', '5'),
                row('| NL | NPO Politiek', '| NL | TV', '6'),
            ],
            { country: 'NL', knownOnly: true },
        );
        expect(channels.map((c) => c.name)).toEqual([
            'NPO 1',
            'NPO Politiek en Nieuws',
            'SBS6',
            'TV 538',
            'Disney Jr.',
            'Viaplay TV',
        ]);
    });

    it('drops channels outside the curated list in strict mode', () => {
        const { channels, stats } = groupChannels(
            [row('| NL | NPO 1', '| NL | TV', '1'), row('| NL | Ziggo Sport Golf', '| NL | TV', '2')],
            { country: 'NL', knownOnly: true },
        );
        expect(channels.map((c) => c.name)).toEqual(['NPO 1']);
        expect(stats.droppedAsUnknown).toBe(1);
    });
});

describe('first variant creates the channel', () => {
    it('a single "| NL | NPO 1 HD" row yields NPO 1 with HD as the default variant', () => {
        const { channels } = groupChannels([row('| NL | NPO 1 HD', '| NL | TV', 'a')], { country: 'NL' });

        expect(channels).toHaveLength(1);
        expect(channels[0]?.name).toBe('NPO 1');
        expect(channels[0]?.variants).toHaveLength(1);
        expect(channels[0]?.primary.quality).toBe('HD');
        expect(channels[0]?.primary.id).toBe('a');
        expect(channels[0]?.primary.url).toBe(channels[0]?.variants[0]?.url);
    });

    it('every channel appears even when each has exactly one feed — nothing is lost to variant collapsing', () => {
        const { channels, stats } = groupChannels(
            [
                row('| NL | NPO 1 HD', '| NL | TV', 'a'),
                row('| NL | RTL 4 HD', '| NL | TV', 'b'),
                row('| NL | SBS 6 HD', '| NL | TV', 'c'),
            ],
            { country: 'NL', knownOnly: true },
        );
        expect(channels.map((c) => c.name)).toEqual(['NPO 1', 'RTL 4', 'SBS6']);
        expect(stats.collapsedVariants).toBe(0);
    });

    it('records the provider spelling of rows the curated list rejected', () => {
        const { stats } = groupChannels(
            [row('| NL | NPO 1', '| NL | TV', 'a'), row('| NL | Onbekende Zender', '| NL | TV', 'b')],
            { country: 'NL', knownOnly: true },
        );
        expect(stats.droppedSamples).toEqual(['Onbekende Zender']);
    });
});
