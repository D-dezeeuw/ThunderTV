import { describe, expect, it } from 'vitest';
import { streamKey } from './stream-key';

describe('streamKey', () => {
    it('masks the Xtream credential segments, so no secret is ever stored', () => {
        const key = streamKey('http://panel.example:8080/live/bob/hunter2/1234.ts');
        expect(key).toBe('panel.example:8080/live/*/*/1234.ts');
        expect(key).not.toContain('bob');
        expect(key).not.toContain('hunter2');
    });

    it('masks movie and series paths the same way', () => {
        expect(streamKey('http://p.example/movie/u/p/99.mkv')).toBe('p.example/movie/*/*/99.mkv');
        expect(streamKey('http://p.example/series/u/p/42.mp4')).toBe('p.example/series/*/*/42.mp4');
    });

    it('survives a password rotation — the same feed keeps one key', () => {
        const before = streamKey('http://p.example/live/bob/oldpass/7.ts');
        const after = streamKey('http://p.example/live/bob/newpass/7.ts');
        expect(before).toBe(after);
    });

    it('keeps distinct streams on the same panel distinct', () => {
        expect(streamKey('http://p.example/live/u/p/1.ts')).not.toBe(streamKey('http://p.example/live/u/p/2.ts'));
    });

    it('treats http and https as one feed, but different ports as different endpoints', () => {
        expect(streamKey('http://p.example/live/u/p/1.ts')).toBe(streamKey('https://p.example/live/u/p/1.ts'));
        expect(streamKey('http://p.example:8080/live/u/p/1.ts')).not.toBe(streamKey('http://p.example:9090/live/u/p/1.ts'));
    });

    it('masks credential-shaped query parameters on a plain M3U URL', () => {
        const key = streamKey('http://p.example/stream.m3u8?username=bob&password=hunter2&id=5');
        expect(key).not.toContain('bob');
        expect(key).not.toContain('hunter2');
        expect(key).toContain('id=5');
    });

    it('gives two URLs differing only in parameter order the same key', () => {
        expect(streamKey('http://p.example/s.m3u8?a=1&b=2')).toBe(streamKey('http://p.example/s.m3u8?b=2&a=1'));
    });

    it('leaves a non-Xtream path untouched apart from the scheme', () => {
        expect(streamKey('https://cdn.example/hls/channel/master.m3u8')).toBe('cdn.example/hls/channel/master.m3u8');
    });

    it('returns null for an unparseable URL rather than bucketing every bad row together', () => {
        expect(streamKey('not a url')).toBeNull();
        expect(streamKey('')).toBeNull();
    });

    it('does not mask when the credential-shaped segments would consume the stream id itself', () => {
        // `/live/1.ts` has no user/pass to mask — masking blindly here would
        // destroy the only part that identifies the stream.
        expect(streamKey('http://p.example/live/1.ts')).toBe('p.example/live/1.ts');
    });
});
