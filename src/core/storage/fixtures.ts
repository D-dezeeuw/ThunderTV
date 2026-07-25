/**
 * Shared row generators (Feature 04.10.6) for the storage matrix and,
 * later, the Phase 06/16 worker tests — one place that knows what a
 * plausible channel/program/favorite row looks like.
 */
import type { ChannelRecord, EpgProgramRecord, FavoriteRecord } from './records';

export function makeChannelRows(playlistId: string, count: number): ChannelRecord[] {
    return Array.from({ length: count }, (_, index) => ({
        playlistId,
        index,
        name: `Channel ${String(index)}`,
        streamUrl: `https://provider.example/stream/${String(index)}.m3u8`,
        logo: null,
        group: index % 10 === 0 ? 'News' : 'Entertainment',
        radio: false,
    }));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Programs are generated in chronological order — `getRange`/`getAll` ordering assertions depend on this. */
export function makeEpgProgramRows(channelId: string, count: number, startAt = 0): EpgProgramRecord[] {
    return Array.from({ length: count }, (_, i) => {
        const start = startAt + i * HOUR_MS;
        return {
            channelId,
            start,
            stop: start + HOUR_MS,
            title: `Program ${String(i)}`,
            description: null,
        };
    });
}

export function makeFavoriteRows(count: number): FavoriteRecord[] {
    return Array.from({ length: count }, (_, index) => ({
        v: 1,
        id: `fav-${String(index).padStart(4, '0')}`,
        name: `Favorite ${String(index)}`,
        streamUrl: `https://provider.example/stream/${String(index)}.m3u8`,
        logo: null,
        group: null,
    }));
}

export const ONE_DAY_MS = DAY_MS;
