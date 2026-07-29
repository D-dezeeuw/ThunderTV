import { afterEach, describe, expect, it } from 'vitest';
import type { EpgProgramRecord } from '../core/storage';
import { clearEpgProgramIndex, hasEpgPrograms, programsForChannel, rowEpgSnapshot, setEpgProgramIndex } from './epg-index';

const HOUR = 60 * 60 * 1000;

function program(channelId: string, hour: number, title: string): EpgProgramRecord {
    return { channelId, start: hour * HOUR, stop: (hour + 1) * HOUR, title, description: null };
}

afterEach(() => {
    clearEpgProgramIndex();
});

describe('the programme index', () => {
    it('starts empty, so a device with no EPG data skips row enrichment entirely', () => {
        expect(hasEpgPrograms()).toBe(false);
        expect(programsForChannel('anything')).toEqual([]);
    });

    it('reports populated once an index is set, and empty again after clearing', () => {
        setEpgProgramIndex(new Map([['a.nl', [program('a.nl', 0, 'Show')]]]));
        expect(hasEpgPrograms()).toBe(true);
        clearEpgProgramIndex();
        expect(hasEpgPrograms()).toBe(false);
    });
});

describe('rowEpgSnapshot', () => {
    it('returns the current title, the next title and a progress percent', () => {
        setEpgProgramIndex(
            new Map([['a.nl', [program('a.nl', 0, 'Breakfast'), program('a.nl', 1, 'The News')]]]),
        );
        const snapshot = rowEpgSnapshot('a.nl', 30 * 60 * 1000); // halfway through Breakfast
        expect(snapshot).toEqual({ nowTitle: 'Breakfast', nextTitle: 'The News', progress: 50 });
    });

    it('reports a null now-title but a real next-title inside a gap', () => {
        setEpgProgramIndex(new Map([['a.nl', [program('a.nl', 0, 'Early'), program('a.nl', 5, 'Later')]]]));
        const snapshot = rowEpgSnapshot('a.nl', 3 * HOUR);
        expect(snapshot).toEqual({ nowTitle: null, nextTitle: 'Later', progress: 0 });
    });

    it('returns null for a channel the catalog never matched (no id to look up)', () => {
        setEpgProgramIndex(new Map([['a.nl', [program('a.nl', 0, 'Show')]]]));
        expect(rowEpgSnapshot(null, 0)).toBeNull();
        expect(rowEpgSnapshot(undefined, 0)).toBeNull();
        expect(rowEpgSnapshot('', 0)).toBeNull();
    });

    it('returns null for a matched channel that has no stored programmes', () => {
        setEpgProgramIndex(new Map([['a.nl', [program('a.nl', 0, 'Show')]]]));
        expect(rowEpgSnapshot('b.nl', 0)).toBeNull();
    });

    it('returns null once every stored programme for the channel has aged out', () => {
        setEpgProgramIndex(new Map([['a.nl', [program('a.nl', 0, 'Show')]]]));
        expect(rowEpgSnapshot('a.nl', 50 * HOUR)).toBeNull();
    });
});
