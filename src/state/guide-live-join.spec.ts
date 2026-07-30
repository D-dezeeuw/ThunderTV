import { describe, expect, it } from 'vitest';
import { buildLiveEpgIndex, matchGuideChannel, selectGuideChannelsForLive, type LiveChannelRef } from './guide-live-join';

/**
 * The reported defect: with an Xtream source the Guide painted the panel's
 * whole `xmltv.php` — thousands of channels, alphabetically — instead of the
 * ones the channel list shows. The join only ever read `ChannelRow.epgId`
 * (the country catalog's match, null on that path), found nothing, and fell
 * back to "show everything".
 */

function live(name: string, ids: { tvgId?: string; epgId?: string } = {}): LiveChannelRef {
    return {
        tvgId: ids.tvgId ?? null,
        epgId: ids.epgId ?? null,
        // `groupChannels()` buckets on the alias-resolved, normalized key.
        key: name.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(),
        name,
    };
}

function guide(id: string, displayName: string, programCount = 1): { id: string; displayName: string; programs: readonly number[] } {
    return { id, displayName, programs: Array.from({ length: programCount }, (_, i) => i) };
}

describe('the guide → live join ladder', () => {
    it('binds on the provider\'s own epg_channel_id, which is what an Xtream guide is keyed by', () => {
        const index = buildLiveEpgIndex([live('NPO 1', { tvgId: 'npo1.nl' })]);
        expect(matchGuideChannel(index, guide('npo1.nl', 'Totally Different Name'))).toEqual({ liveIndex: 0, tier: 0 });
    });

    it('still binds on the country catalog id, for a source that serves no guide of its own', () => {
        const index = buildLiveEpgIndex([live('NPO 1', { epgId: 'NPO 1.nl' })]);
        expect(matchGuideChannel(index, guide('NPO 1.nl', 'NPO 1'))?.tier).toBe(1);
    });

    it('falls back to the name, through the same parser the channel list buckets on', () => {
        const index = buildLiveEpgIndex([live('NPO 1')]);
        // Country prefix and quality suffix are decoration on both sides.
        expect(matchGuideChannel(index, guide('anything.at.all', '| NL | NPO 1 HD'))?.tier).toBe(2);
    });

    it('reports no match rather than guessing at a channel this subscription lacks', () => {
        const index = buildLiveEpgIndex([live('NPO 1', { tvgId: 'npo1.nl' })]);
        expect(matchGuideChannel(index, guide('bbc-one.uk', 'BBC One'))).toBeNull();
    });

    it('prefers the id join over the name join when both would resolve', () => {
        const index = buildLiveEpgIndex([live('RTL 4'), live('NPO 1', { tvgId: 'npo1.nl' })]);
        // Name says row 0, tvg-id says row 1. The exact join wins.
        expect(matchGuideChannel(index, guide('npo1.nl', 'RTL 4'))).toEqual({ liveIndex: 1, tier: 0 });
    });
});

describe('selectGuideChannelsForLive', () => {
    it('keeps only what Live carries, in Live\'s order — not the feed\'s', () => {
        const rows = [live('NPO 1', { tvgId: 'npo1.nl' }), live('RTL 4', { tvgId: 'rtl4.nl' })];
        const feed = [
            guide('zzz.nl', 'Some Channel Nobody Has'),
            guide('rtl4.nl', 'RTL 4'),
            guide('aaa.nl', 'Another One'),
            guide('npo1.nl', 'NPO 1'),
        ];
        expect(selectGuideChannelsForLive(feed, rows).map((c) => c.id)).toEqual(['npo1.nl', 'rtl4.nl']);
    });

    it('waits instead of painting the whole feed when Live has not propagated yet', () => {
        // The actual regression: an empty Live list used to mean "show
        // everything", which is how the grid filled with the wrong channels.
        expect(selectGuideChannelsForLive([guide('a.nl', 'A'), guide('b.nl', 'B')], [])).toEqual([]);
    });

    it('shows one row per channel when the feed carries the same channel twice', () => {
        const rows = [live('NPO 1', { tvgId: 'npo1.nl' })];
        const feed = [guide('npo1.nl', 'NPO 1', 12), guide('npo1hd.nl', 'NPO 1 HD', 12)];
        const selected = selectGuideChannelsForLive(feed, rows);
        expect(selected.map((c) => c.id)).toEqual(['npo1.nl']);
    });

    it('lets a full entry displace an empty one that matched on the same rung', () => {
        const rows = [live('NPO 1')];
        const feed = [guide('npo1-empty.nl', 'NPO 1', 0), guide('npo1-full.nl', 'NPO 1', 40)];
        expect(selectGuideChannelsForLive(feed, rows).map((c) => c.id)).toEqual(['npo1-full.nl']);
        // Same result whichever order the feed happened to arrive in.
        expect(selectGuideChannelsForLive([...feed].reverse(), rows).map((c) => c.id)).toEqual(['npo1-full.nl']);
    });
});
