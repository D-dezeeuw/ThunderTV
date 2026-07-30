import { describe, expect, it } from 'vitest';
import { judgeAudioOutput } from './audio-output';

/**
 * The judge is the whole risk here: a false 'silent' puts "no sound" over a
 * stream that has sound, which is worse than staying quiet. Everything it
 * cannot prove has to come back 'unknown'.
 */
describe('judgeAudioOutput', () => {
    it('calls it silent when video decodes and audio never does — the AC-3/DTS movie', () => {
        expect(judgeAudioOutput({ audioBytes: 0, videoBytes: 4_000_000 })).toBe('silent');
    });

    it("trusts Firefox's mozHasAudio in both directions", () => {
        expect(judgeAudioOutput({ hasAudio: false })).toBe('silent');
        expect(judgeAudioOutput({ hasAudio: true })).toBe('ok');
    });

    it('is ok the moment a single audio byte is decoded', () => {
        expect(judgeAudioOutput({ audioBytes: 1, videoBytes: 0 })).toBe('ok');
    });

    it('stays unknown while nothing has decoded yet — the stream may not have started', () => {
        expect(judgeAudioOutput({ audioBytes: 0, videoBytes: 0 })).toBe('unknown');
    });

    it('stays unknown on a browser that exposes no counters at all', () => {
        expect(judgeAudioOutput({})).toBe('unknown');
    });
});
