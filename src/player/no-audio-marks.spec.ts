import { beforeEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import {
    allNoAudioMarks,
    clearNoAudioMark,
    markApplies,
    markedContentId,
    markNoAudio,
    noAudioMark,
    resetNoAudioMarksForTests,
} from './no-audio-marks';

/**
 * The rule this file exists for is the *class* one: what a browser learned
 * says nothing about a desktop that can re-encode the same soundtrack, while
 * what a desktop learned with ffmpeg behind it is true everywhere. Getting
 * that backwards would hide watchable films on the one host that can play
 * them.
 */
describe('markApplies', () => {
    const mark = (platformClass: 'transcode' | 'no-transcode') => ({ id: 'vod:1', platformClass, reason: 'silent', at: 0 });

    it('trusts a desktop failure everywhere and a browser failure only on other browsers', () => {
        expect(markApplies(mark('transcode'), true)).toBe(true);
        expect(markApplies(mark('transcode'), false)).toBe(true);
        expect(markApplies(mark('no-transcode'), false)).toBe(true);
        expect(markApplies(mark('no-transcode'), true)).toBe(false);
    });

    it('says nothing about a title nobody has played', () => {
        expect(markApplies(null, false)).toBe(false);
    });
});

describe('marking', () => {
    beforeEach(() => {
        resetNoAudioMarksForTests();
    });

    it('never lets a weaker later finding overwrite a stronger one', async () => {
        await withFakePlatform({}, () => {
            markNoAudio('vod:1', 'transcode', 'ffmpeg exited (1)');
            markNoAudio('vod:1', 'no-transcode', 'silent');

            expect(noAudioMark('vod:1')?.platformClass).toBe('transcode');
        });
    });

    it('forgets a title the moment it plays with sound', async () => {
        await withFakePlatform({}, () => {
            markNoAudio('vod:1', 'no-transcode', 'silent');
            clearNoAudioMark('vod:1');

            expect(noAudioMark('vod:1')).toBeNull();
            expect(allNoAudioMarks()).toEqual([]);
        });
    });
});

describe('markedContentId', () => {
    it('files an episode under its show, and refuses to file a live channel at all', () => {
        expect(markedContentId({ id: 'vod:9', kind: 'vod' })).toBe('vod:9');
        // The list row a viewer sees is the show; marking one episode of
        // twenty-four would warn nobody about the other twenty-three.
        expect(markedContentId({ id: 'series-ep:7:123', kind: 'series', series: { seriesId: 7 } })).toBe('series:7');
        expect(markedContentId({ id: 'chan-1', kind: 'live' })).toBeNull();
        expect(markedContentId(null)).toBeNull();
    });
});
