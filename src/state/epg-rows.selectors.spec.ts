import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import type { EpgProgramRecord, FavoriteRecord } from '../core/storage';
import type { ChannelRow } from '../m3u/types';
import { setRows as setMemoryRows, clearRows } from '../m3u/channel-memory';
import { mountTemplate } from '../shared/testing/bind-dom';
import { setEpgProgramIndex } from './epg-index';
import { publishFavorites } from './favorites';
import { nowLinesFor } from './epg-rows.selectors';

/**
 * The Starred/Recents EPG line. Those views hold denormalized snapshots with
 * no guide id of their own, so the line has to be joined back through the
 * channel row wearing the same id — and an id that resolves to nothing must
 * produce no line at all rather than a neighbour's programme.
 */
const HOUR = 60 * 60 * 1000;
const NOW = 10 * HOUR;

function program(channelId: string, title: string, from = NOW - HOUR, to = NOW + HOUR): EpgProgramRecord {
    return { channelId, start: from, stop: to, title, description: null };
}

function row(id: string, over: Partial<ChannelRow> = {}): ChannelRow {
    return { id, name: `Channel ${id}`, url: `http://example.test/${id}`, group: null, logo: null, tvgId: null, radio: false, ...over };
}

afterEach(() => {
    setEpgProgramIndex(new Map());
    clearRows();
});

describe('nowLinesFor()', () => {
    it('joins a starred id to its own channel, and leaves the unmatched ones out', () => {
        setMemoryRows([row('src:1', { tvgId: 'one.nl' }), row('src:2', { tvgId: 'two.nl' })]);
        setEpgProgramIndex(new Map([['one.nl', [program('one.nl', 'The Nine O\'Clock News')]]]));

        // 'src:2' has a tvg-id the guide knows nothing about; 'src:9' is not
        // in memory at all (a source that has not loaded yet).
        expect(nowLinesFor(['src:1', 'src:2', 'src:9'], NOW)).toEqual({ 'src:1': "The Nine O'Clock News" });
    });

    it('resolves an entry captured from a feed Live collapsed into a variant', () => {
        const primary = row('src:1', {
            tvgId: 'one.nl',
            variants: [{ id: 'src:7', url: 'http://example.test/hd', label: 'HD', quality: 'HD', isRecording: false, provider: null, tier: 2 }],
        });
        setMemoryRows([primary]);
        setEpgProgramIndex(new Map([['one.nl', [program('one.nl', 'Breakfast')]]]));

        expect(nowLinesFor(['src:7'], NOW)).toEqual({ 'src:7': 'Breakfast' });
    });

    it('says nothing for a channel with a gap on air rather than reaching for the next programme', () => {
        setMemoryRows([row('src:1', { tvgId: 'one.nl' })]);
        setEpgProgramIndex(new Map([['one.nl', [program('one.nl', 'Later', NOW + HOUR, NOW + 2 * HOUR)]]]));

        expect(nowLinesFor(['src:1'], NOW)).toEqual({});
    });

    it('does no work at all on a device with no guide data', () => {
        setMemoryRows([row('src:1', { tvgId: 'one.nl' })]);
        expect(nowLinesFor(['src:1'], NOW)).toEqual({});
    });
});

describe('the Starred list', () => {
    function starredTemplate(): string {
        const repoRoot = fileURLToPath(new NodeURL('../..', import.meta.url));
        const host = document.createElement('div');
        host.innerHTML = readFileSync(`${repoRoot}/index.html`, 'utf8');
        const list = host.querySelector('.starred-list');
        if (!list) throw new Error('index.html has no .starred-list to mount');
        return list.outerHTML;
    }

    function favorite(id: string, addedAt: number): FavoriteRecord {
        return { v: 1, id, name: `Channel ${id}`, streamUrl: `http://example.test/${id}`, logo: null, group: null, sourceId: 'src', addedAt };
    }

    it('gives each row its own channel line, and none to a channel with no guide data', () => {
        setMemoryRows([row('src:1', { tvgId: 'one.nl' }), row('src:2', { tvgId: 'two.nl' })]);
        // The selector reads the wall clock, so this one has to be on air now.
        const airing = Date.now();
        setEpgProgramIndex(new Map([['one.nl', [program('one.nl', 'Breakfast', airing - HOUR, airing + HOUR)]]]));

        const mounted = mountTemplate(starredTemplate());
        publishFavorites([favorite('src:1', 2), favorite('src:2', 1)]);
        tick();

        const lines = mounted
            .queryAll<HTMLElement>('.starred-list__row')
            .map((el) => [el.dataset['id'], el.querySelector<HTMLElement>('.recent-zap-history__epg')?.style.display === 'none' ? '' : (el.querySelector('.recent-zap-history__epg')?.textContent?.trim() ?? '')]);
        expect(lines).toEqual([
            ['src:1', 'Breakfast'],
            ['src:2', ''],
        ]);
        mounted.cleanup();
    });
});
