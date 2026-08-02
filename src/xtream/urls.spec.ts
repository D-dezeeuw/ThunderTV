import { describe, expect, it } from 'vitest';
import { apiUrl, liveStreamUrl, normalizeXtreamUrl, redactUrl, seriesEpisodeUrl, vodStreamUrl } from './urls';
import type { XtreamSource } from './types';

const source: XtreamSource = { url: 'http://example.com:8080', user: 'bob', pass: 'p@ss&w/rd%1' };

describe('xtream/urls', () => {
    it('apiUrl builds the player_api.php shape with encoded credentials', () => {
        expect(apiUrl(source, 'get_live_categories')).toBe(
            'http://example.com:8080/player_api.php?username=bob&password=p%40ss%26w%2Frd%251&action=get_live_categories',
        );
    });

    it('liveStreamUrl builds the /live/user/pass/id.ext shape', () => {
        expect(liveStreamUrl(source, 42)).toBe('http://example.com:8080/live/bob/p%40ss%26w%2Frd%251/42.m3u8');
        expect(liveStreamUrl(source, 42, 'ts')).toBe('http://example.com:8080/live/bob/p%40ss%26w%2Frd%251/42.ts');
    });

    it('normalizeXtreamUrl strips a trailing slash and a pasted player_api.php path', () => {
        expect(normalizeXtreamUrl('http://example.com/')).toBe('http://example.com');
        expect(normalizeXtreamUrl('http://example.com/player_api.php?x=1')).toBe('http://example.com');
        expect(normalizeXtreamUrl('  http://example.com  ')).toBe('http://example.com');
    });

    it('normalizeXtreamUrl prepends http:// when no scheme was typed', () => {
        expect(normalizeXtreamUrl('provider.example:8080')).toBe('http://provider.example:8080');
        expect(normalizeXtreamUrl('provider.example')).toBe('http://provider.example');
        expect(normalizeXtreamUrl('https://provider.example')).toBe('https://provider.example');
        expect(normalizeXtreamUrl('')).toBe('');
    });

    it('redactUrl masks credentials in both the api and stream URL shapes', () => {
        expect(redactUrl(apiUrl(source, 'get_live_categories'))).toBe(
            'http://example.com:8080/player_api.php?username=REDACTED&password=REDACTED&action=get_live_categories',
        );
        expect(redactUrl(liveStreamUrl(source, 42))).toBe('http://example.com:8080/live/REDACTED/REDACTED/42.m3u8');
    });

    it('vodStreamUrl builds the /movie/user/pass/id.ext shape, defaulting to mp4', () => {
        expect(vodStreamUrl(source, 7)).toBe('http://example.com:8080/movie/bob/p%40ss%26w%2Frd%251/7.mp4');
        expect(vodStreamUrl(source, 7, 'mkv')).toBe('http://example.com:8080/movie/bob/p%40ss%26w%2Frd%251/7.mkv');
    });

    it('seriesEpisodeUrl builds the /series/user/pass/id.ext shape and accepts a string episode id', () => {
        expect(seriesEpisodeUrl(source, 99)).toBe('http://example.com:8080/series/bob/p%40ss%26w%2Frd%251/99.mp4');
        expect(seriesEpisodeUrl(source, 'abc123', 'mkv')).toBe(
            'http://example.com:8080/series/bob/p%40ss%26w%2Frd%251/abc123.mkv',
        );
    });

    it('redactUrl masks credentials in the movie and series URL shapes', () => {
        expect(redactUrl(vodStreamUrl(source, 7))).toBe('http://example.com:8080/movie/REDACTED/REDACTED/7.mp4');
        expect(redactUrl(seriesEpisodeUrl(source, 99))).toBe(
            'http://example.com:8080/series/REDACTED/REDACTED/99.mp4',
        );
    });
});
