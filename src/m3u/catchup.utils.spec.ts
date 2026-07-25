import { describe, expect, it } from 'vitest';
import {
    getM3uArchiveDays,
    isM3uCatchupPlaybackSupported,
    resolveM3uCatchupUrl,
    type CatchupChannelLike,
    type CatchupProgramLike,
} from './catchup.utils';

/**
 * Ported from thunder-tv's `catchup.utils.spec.ts` (Feature 06.1.7), adapted
 * to `CatchupChannelLike`/`CatchupProgramLike` instead of the full
 * `Channel`/`EpgProgram` interfaces — this module now takes only the raw
 * parser fields it actually reads (Feature 06.1.5's decision note).
 *
 * Dropped: the original suite's final "preserves catchup metadata when
 * storing parsed playlist items" case, which exercised thunder-tv's nested
 * `createPlaylistObject` — ThunderTV's `ChannelRow` is deliberately flat
 * (Feature 06.5.1) and does not retain `catchup`/`timeshift` at all, so
 * there is nothing analogous to assert here yet; a future catchup feature
 * decides how these fields reach the row shape.
 */
describe('catchup.utils', () => {
    const baseChannel: CatchupChannelLike = {
        url: 'https://streams.example.com/live/channel-1.m3u8',
        tvg: { rec: '3' },
        catchup: { type: 'shift', days: '3' },
        timeshift: '3',
    };

    const archivedProgram: CatchupProgramLike = {
        start: '2026-04-10T08:00:00.000Z',
        startTimestamp: 1_775_808_800,
    };

    it('reports archive days from catchup metadata before legacy fields', () => {
        expect(
            getM3uArchiveDays({
                ...baseChannel,
                catchup: { type: 'shift', days: '5' },
                timeshift: '3',
                tvg: { rec: '2' },
            }),
        ).toBe(5);
    });

    it('falls back to tvg-rec when catchup-days and timeshift are blank strings', () => {
        expect(
            getM3uArchiveDays({
                ...baseChannel,
                catchup: { type: '', days: '' },
                timeshift: '',
                tvg: { rec: '7' },
            }),
        ).toBe(7);
    });

    it('skips a blank tvg-rec and uses a real timeshift value', () => {
        // `tvg-rec=""` is a common parser default; a nullish (`??`) chain would
        // stop on it and yield 0 (unbounded window). The non-blank helper skips
        // it and returns the real timeshift days.
        expect(
            getM3uArchiveDays({
                ...baseChannel,
                catchup: undefined,
                timeshift: '7',
                tvg: { rec: '' },
            }),
        ).toBe(7);
    });

    it('supports legacy same-stream shift playback when catchup type is shift', () => {
        expect(isM3uCatchupPlaybackSupported(baseChannel)).toBe(true);
        expect(resolveM3uCatchupUrl(baseChannel, archivedProgram, 1_775_820_000)).toBe(
            'https://streams.example.com/live/channel-1.m3u8?utc=1775808800&lutc=1775820000',
        );
    });

    it('supports tvg-rec-only legacy same-stream playback when the channel url is reusable', () => {
        const channel: CatchupChannelLike = {
            ...baseChannel,
            tvg: { rec: '7' },
            catchup: undefined,
            timeshift: undefined,
        };

        expect(isM3uCatchupPlaybackSupported(channel)).toBe(true);
        expect(resolveM3uCatchupUrl(channel, archivedProgram, 1_775_820_000)).toBe(
            'https://streams.example.com/live/channel-1.m3u8?utc=1775808800&lutc=1775820000',
        );
    });

    it('rewrites utc and lutc query params on catchup-source urls', () => {
        const playbackUrl = resolveM3uCatchupUrl(
            {
                ...baseChannel,
                catchup: {
                    type: 'append',
                    days: '3',
                    source: 'https://archive.example.com/catchup.m3u8?utc=1&lutc=2&token=abc',
                },
            },
            archivedProgram,
            1_775_820_000,
        );

        expect(playbackUrl).toBe(
            'https://archive.example.com/catchup.m3u8?utc=1775808800&lutc=1775820000&token=abc',
        );
    });

    it('returns null when the channel metadata declares an unsupported replay scheme', () => {
        expect(
            isM3uCatchupPlaybackSupported({
                ...baseChannel,
                catchup: { type: 'append', days: '3', source: '' },
                timeshift: '3',
            }),
        ).toBe(false);
        expect(
            resolveM3uCatchupUrl(
                {
                    ...baseChannel,
                    catchup: { type: 'append', days: '3', source: '' },
                    timeshift: '3',
                },
                archivedProgram,
            ),
        ).toBeNull();
    });

    it('returns null for tvg-rec-only channels when the stream url is not http', () => {
        const channel: CatchupChannelLike = {
            ...baseChannel,
            url: 'udp://239.0.0.1:1234',
            tvg: { rec: '7' },
            catchup: undefined,
            timeshift: undefined,
        };

        expect(isM3uCatchupPlaybackSupported(channel)).toBe(false);
        expect(resolveM3uCatchupUrl(channel, archivedProgram)).toBeNull();
    });

    it('returns null when archive days are missing', () => {
        expect(
            resolveM3uCatchupUrl(
                {
                    ...baseChannel,
                    tvg: { rec: '' },
                    timeshift: '',
                    catchup: { type: 'shift', days: '' },
                },
                archivedProgram,
            ),
        ).toBeNull();
    });

    it('falls back to parsing the program start string when the unix timestamp is unavailable', () => {
        expect(
            resolveM3uCatchupUrl(
                baseChannel,
                { start: '202604100800 +0000', startTimestamp: null },
                1_775_820_000,
            ),
        ).toBe('https://streams.example.com/live/channel-1.m3u8?utc=1775808000&lutc=1775820000');
    });

    it('applies negative sub-hour XMLTV offsets such as -0030', () => {
        // Regression: Number('-00') === -0, so a Math.sign()-based conversion
        // dropped the minutes' sign and treated -0030 as UTC.
        expect(
            resolveM3uCatchupUrl(
                baseChannel,
                { start: '202604100800 -0030', startTimestamp: null },
                1_775_820_000,
            ),
        ).toBe('https://streams.example.com/live/channel-1.m3u8?utc=1775809800&lutc=1775820000');
    });

    it('applies positive offsets with minutes such as +0530', () => {
        expect(
            resolveM3uCatchupUrl(
                baseChannel,
                { start: '202604100800 +0530', startTimestamp: null },
                1_775_820_000,
            ),
        ).toBe('https://streams.example.com/live/channel-1.m3u8?utc=1775788200&lutc=1775820000');
    });

    it('applies positive sub-hour XMLTV offsets such as +0030', () => {
        // Regression: Number('+00') === 0, so a Math.sign()-based conversion
        // dropped the minutes and treated +0030 as UTC.
        expect(
            resolveM3uCatchupUrl(
                baseChannel,
                { start: '202604100800 +0030', startTimestamp: null },
                1_775_820_000,
            ),
        ).toBe('https://streams.example.com/live/channel-1.m3u8?utc=1775806200&lutc=1775820000');
    });

    it('treats a -0000 offset as UTC', () => {
        expect(
            resolveM3uCatchupUrl(
                baseChannel,
                { start: '202604100800 -0000', startTimestamp: null },
                1_775_820_000,
            ),
        ).toBe('https://streams.example.com/live/channel-1.m3u8?utc=1775808000&lutc=1775820000');
    });
});
