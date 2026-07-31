import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
import { setRows as setMemoryRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { EPG_TICK } from './epg';
import { GUIDE_CHANNELS, type GuideChannel, type GuideProgram } from './guide';
import { registerGuideSelectors, type GuideView } from './guide.selectors';
import { invalidateLiveRows } from './live-rows';
import { publishRowsForCurrentView, refreshLiveRows } from './live.actions';
import { get } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

/**
 * The reported defect, end to end: "the Guide works, after some loading, but
 * it takes the wrong channel."
 *
 * A panel's `xmltv.php` covers the whole account — thousands of channels,
 * including everything the Live filters hid. The Guide is supposed to narrow
 * that to the channels the list actually shows, but it joined on
 * `ChannelRow.epgId` (the country catalog's match, which nothing fills on the
 * Xtream path), found no overlap, and took its "Live hasn't published yet"
 * escape hatch: paint the entire feed, alphabetically.
 */

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

afterEach(() => {
    resetState();
    invalidateLiveRows();
});

function program(channelId: string): GuideProgram {
    return { channelId, start: NOW - 30 * 60 * 1000, stop: NOW + 30 * 60 * 1000, title: 'Whatever is on', description: null };
}

function guideChannel(id: string, displayName: string): GuideChannel {
    return { id, displayName, icon: null, programs: [program(id)] };
}

/** A raw playlist row as `src/xtream/client.ts` writes it: the panel's `epg_channel_id` lands on `tvgId`. */
function row(id: string, name: string, tvgId: string | null): ChannelRow {
    return { id, name, url: `http://panel/live/u/p/${id}.m3u8`, group: null, logo: null, tvgId, radio: false };
}

/** The panel's whole guide — the two channels this subscription carries, plus the rest of the account. */
const FEED: GuideChannel[] = [
    guideChannel('aaa.tv', 'A Channel Nobody Subscribed To'),
    guideChannel('rtl4.nl', 'RTL 4'),
    guideChannel('zzz.tv', 'Another Unsubscribed One'),
    guideChannel('npo1.nl', 'NPO 1'),
];

function view(): GuideView {
    return get<GuideView>('guide.view') as GuideView;
}

describe('the Guide follows the Live channel list', () => {
    it('waits for the channel list rather than painting the whole feed', () => {
        const mounted = mountTemplate('<div></div>');
        registerGuideSelectors();
        setValue(GUIDE_CHANNELS, FEED);
        setValue(EPG_TICK, NOW);
        tick();

        // Nothing imported yet. Four channels are sitting in state and every
        // one of them used to end up on screen.
        expect(view().channels).toEqual([]);
        expect(view().hasData).toBe(false);

        mounted.cleanup();
    });

    it('narrows to the subscription\'s own channels, in Live\'s order, as soon as they propagate', () => {
        const mounted = mountTemplate('<div></div>');
        registerGuideSelectors();
        setValue(GUIDE_CHANNELS, FEED);
        setValue(EPG_TICK, NOW);
        setValue(UI_ACTIVE_VIEW, 'live');
        tick();

        setMemoryRows([row('1', '| NL | NPO 1 HD', 'npo1.nl'), row('2', '| NL | RTL 4 FHD', 'rtl4.nl')]);
        refreshLiveRows();
        // No second `epg.tick` beat — `live.stats` is what re-runs the view.
        tick();

        // Live's own broadcast-rank order (NPO 1 before RTL 4), not the feed's.
        expect(view().channels.map((c) => c.displayName)).toEqual(['NPO 1', 'RTL 4']);
        expect(view().hasData).toBe(true);
        // And every block on screen belongs to one of them.
        expect(view().programs).toHaveLength(2);

        mounted.cleanup();
    });

    it('labels each row with the TV list\'s name for it, never the feed\'s own', () => {
        const mounted = mountTemplate('<div></div>');
        registerGuideSelectors();
        // A panel that spells its guide entries however it likes — including,
        // as the report had it, the same name on every one of them.
        setValue(GUIDE_CHANNELS, [
            { ...guideChannel('npo1.nl', 'Canal+'), id: 'npo1.nl' },
            { ...guideChannel('rtl4.nl', 'Canal+'), id: 'rtl4.nl' },
        ]);
        setValue(EPG_TICK, NOW);
        setValue(UI_ACTIVE_VIEW, 'live');
        tick();

        setMemoryRows([row('1', '| NL | NPO 1 HD', 'npo1.nl'), row('2', '| NL | RTL 4 FHD', 'rtl4.nl')]);
        refreshLiveRows();
        tick();

        expect(view().channels.map((c) => c.displayName)).toEqual(['NPO 1', 'RTL 4']);

        mounted.cleanup();
    });

    it('builds the Live rows for a viewer who opened the Guide without ever visiting TV', () => {
        const mounted = mountTemplate('<div></div>');
        registerGuideSelectors();
        setValue(GUIDE_CHANNELS, FEED);
        setValue(EPG_TICK, NOW);
        setValue(UI_ACTIVE_VIEW, 'guide');
        setMemoryRows([row('1', '| NL | NPO 1 HD', 'npo1.nl')]);
        tick();

        publishRowsForCurrentView();
        tick();

        expect(view().channels.map((c) => c.displayName)).toEqual(['NPO 1']);

        mounted.cleanup();
    });
});
