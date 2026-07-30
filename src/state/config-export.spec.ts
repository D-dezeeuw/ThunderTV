import { describe, expect, it } from 'vitest';
import { redactUrl } from './config-export';

/**
 * The config export is meant to be shared for diagnosis (module header
 * comment) — this is the redactor standing between a shared file and a
 * leaked Xtream username/password, so it gets the same hostile-fixture
 * treatment as its sibling `xtream/urls.ts`'s `redactUrl`.
 */
describe('config-export redactUrl', () => {
    it('strips userinfo and credential-shaped query params', () => {
        const url = redactUrl('https://bob:p%40ss@example.com/get.php?username=bob&password=p%40ss&type=m3u');
        expect(url).not.toContain('bob');
        expect(url).not.toContain('p%40ss');
        expect(url).toBe('https://example.com/get.php?username=REDACTED&password=REDACTED&type=m3u');
    });

    it('masks Xtream path-embedded credentials in live/movie/series stream URLs', () => {
        expect(redactUrl('http://example.com:8080/live/bob/p@ss/42.ts')).toBe(
            'http://example.com:8080/live/REDACTED/REDACTED/42.ts',
        );
        expect(redactUrl('http://example.com:8080/movie/bob/p@ss/7.mp4')).toBe(
            'http://example.com:8080/movie/REDACTED/REDACTED/7.mp4',
        );
        expect(redactUrl('http://example.com:8080/series/bob/p@ss/99.mp4')).toBe(
            'http://example.com:8080/series/REDACTED/REDACTED/99.mp4',
        );
    });

    it('falls back to a placeholder for an unparseable URL rather than leaking the input', () => {
        expect(redactUrl('::not a url::')).toBe('[unparseable url redacted]');
    });

    it('returns an empty string for null, and leaves a clean URL unchanged', () => {
        expect(redactUrl(null)).toBe('');
        expect(redactUrl('https://example.com/list.m3u')).toBe('https://example.com/list.m3u');
    });
});
