import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { setRows as setMemoryRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { mountTemplate } from '../shared/testing/bind-dom';
import { LIVE_STATS, type LiveStats } from './live';
import { publishRowsForCurrentView, refreshLiveRows } from './live.actions';
import { invalidateLiveRows, liveDisplayRows } from './live-rows';
import { setLiveCountry, toggleSetting } from './settings.actions';
import { get } from './typed';
import { UI_ACTIVE_VIEW } from './ui';
import { rowAt, rowCount } from '../ui/virtual-list';

function row(name: string, group: string, id: string): ChannelRow {
    return { id, name, url: `http://x/${id}.ts`, group, logo: null, tvgId: null, radio: false };
}

/** A miniature version of the shape a real Dutch Xtream dump has. */
const CATALOG: ChannelRow[] = [
    row('| NL | NPO 1 HD', '| NL | ENTERTAINMENT', '1'),
    row('| NL | NPO 1 FHD', '| NL | ENTERTAINMENT', '2'),
    row('| NL | NPO 1 HD rec', '| NL | ENTERTAINMENT', '3'),
    row('| NL | RTL 4 HD', '| NL | ENTERTAINMENT', '4'),
    row('| NL | VIAPLAY 07', '| NL | SPORT', '5'),
    row('| UK | BBC One HD', '| UK | ENTERTAINMENT', '6'),
];

function mountWithCatalog(): ReturnType<typeof mountTemplate> {
    const mounted = mountTemplate('<div></div>');
    invalidateLiveRows();
    setMemoryRows(CATALOG);
    return mounted;
}

describe('publishRowsForCurrentView', () => {
    it('publishes grouped, country-filtered rows in Live', () => {
        const mounted = mountWithCatalog();

        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        publishRowsForCurrentView();

        // NPO 1's three feeds collapse to one row; VIAPLAY 07 and the UK
        // channel are gone.
        expect(rowCount()).toBe(2);
        expect([rowAt(0)?.name, rowAt(1)?.name]).toEqual(['NPO 1', 'RTL 4']);
        expect(rowAt(0)?.variants).toHaveLength(3);

        mounted.cleanup();
    });

    it('publishes the provider catalog untouched in Categories', () => {
        const mounted = mountWithCatalog();

        setValue(UI_ACTIVE_VIEW, 'categories');
        tick();
        publishRowsForCurrentView();

        expect(rowCount()).toBe(CATALOG.length);
        expect(rowAt(0)?.name).toBe('| NL | NPO 1 HD');

        mounted.cleanup();
    });

    it('publishes the stats readout so hidden rows are always accounted for', () => {
        const mounted = mountWithCatalog();

        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        publishRowsForCurrentView();
        tick();

        const stats = get<LiveStats>(LIVE_STATS);
        expect(stats?.inputRows).toBe(6);
        expect(stats?.channels).toBe(2);
        expect(stats?.hiddenByCountry).toBe(1);
        expect(stats?.hiddenAsJunk).toBe(1);
        expect(stats?.collapsed).toBe(2);

        mounted.cleanup();
    });

    it('rebuilds when a filter setting changes', () => {
        const mounted = mountWithCatalog();
        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        publishRowsForCurrentView();
        expect(rowCount()).toBe(2);

        // Switching the country off keeps every country — the BBC row now
        // survives, still grouped.
        setLiveCountry('');
        tick();
        refreshLiveRows();
        expect(liveDisplayRows().map((r) => r.name)).toEqual(['NPO 1', 'RTL 4', 'BBC One']);

        // …and turning off junk filtering brings the event slot back.
        toggleSetting('liveDropJunk');
        tick();
        refreshLiveRows();
        expect(liveDisplayRows().map((r) => r.name)).toContain('VIAPLAY 07');

        mounted.cleanup();
    });
});
