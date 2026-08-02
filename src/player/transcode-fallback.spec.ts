import { describe, expect, it } from 'vitest';
import { transcodableSource } from './transcode-fallback';

/**
 * Which streams the desktop transcode route may take over. The rule that
 * matters is the exclusion: a live channel reaches the element through
 * mpegts.js, has no duration to seek in, and is routinely MPEG-2 video that
 * `-c:v copy` cannot put into an MP4 anything will play — so silence on a
 * live channel keeps its message rather than getting a route that would
 * break playback that currently works.
 */
describe('transcodableSource', () => {
    it('takes a movie or an episode', () => {
        expect(transcodableSource({ streamUrl: 'http://p.tv/movie/u/p/9.mkv', kind: 'vod' })).toBe('http://p.tv/movie/u/p/9.mkv');
        expect(transcodableSource({ streamUrl: 'https://p.tv/series/u/p/9.mp4', kind: 'series' })).toBe('https://p.tv/series/u/p/9.mp4');
    });

    it('leaves live alone — including a snapshot from before `kind` existed', () => {
        expect(transcodableSource({ streamUrl: 'http://p.tv/live/u/p/9.ts', kind: 'live' })).toBeNull();
        expect(transcodableSource({ streamUrl: 'http://p.tv/live/u/p/9.ts' })).toBeNull();
        expect(transcodableSource(null)).toBeNull();
    });

    it('refuses anything ffmpeg would be handed as a non-http URL', () => {
        expect(transcodableSource({ streamUrl: 'file:///etc/passwd', kind: 'vod' })).toBeNull();
        expect(transcodableSource({ streamUrl: '', kind: 'vod' })).toBeNull();
    });
});
