import { describe, expect, it } from 'vitest';
import { apiUrl, liveStreamUrl, normalizeXtreamUrl, redactUrl } from './urls';
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

    it('redactUrl masks credentials in both the api and stream URL shapes', () => {
        expect(redactUrl(apiUrl(source, 'get_live_categories'))).toBe(
            'http://example.com:8080/player_api.php?username=***&password=***&action=get_live_categories',
        );
        expect(redactUrl(liveStreamUrl(source, 42))).toBe('http://example.com:8080/live/***/***/42.m3u8');
    });
});
