import { describe, expect, it } from 'vitest';
import { redactJsonCredentialFields, redactText, redactUrl } from './redact';

/**
 * The cases that matter are the ones the five previous implementations
 * disagreed about: userinfo, the `/live/user/pass/` path shape, parameters
 * beyond username/password, and mixed case. Each of those leaked through at
 * least one of the old redactors.
 */
describe('redactUrl', () => {
    it('masks every credential parameter, whatever its case', () => {
        expect(redactUrl('http://h/get.php?Username=bob&PASSWORD=s3cret&token=t&auth=a&key=k&type=m3u')).toBe(
            'http://h/get.php?Username=REDACTED&PASSWORD=REDACTED&token=REDACTED&auth=REDACTED&key=REDACTED&type=m3u',
        );
    });

    it('strips userinfo, including a password containing its own @', () => {
        const url = redactUrl('https://bob:p@ss@example.com/list.m3u');
        expect(url).toBe('https://example.com/list.m3u');
        expect(url).not.toContain('bob');
    });

    it('masks the Xtream path credentials, at the root and under a subpath', () => {
        expect(redactUrl('http://h:8080/live/bob/s3cret/42.ts')).toBe('http://h:8080/live/REDACTED/REDACTED/42.ts');
        expect(redactUrl('http://h/movie/bob/s3cret/7.mp4')).toBe('http://h/movie/REDACTED/REDACTED/7.mp4');
        // The old anchored regex missed this one entirely.
        expect(redactUrl('http://h/iptv/series/bob/s3cret/99.mp4')).toBe(
            'http://h/iptv/series/REDACTED/REDACTED/99.mp4',
        );
    });

    it('falls back to a placeholder rather than echoing an unparseable URL', () => {
        expect(redactUrl('::not a url::')).toBe('[unparseable url redacted]');
    });

    it('leaves a URL with nothing credential-shaped in it alone', () => {
        expect(redactUrl('https://example.com/list.m3u')).toBe('https://example.com/list.m3u');
    });
});

describe('redactText', () => {
    it('redacts a URL embedded mid-sentence, which is how it reaches the debug log', () => {
        const out = redactText('load failed for http://h/live/bob/s3cret/42.ts?token=abc — retrying');
        expect(out).toContain('retrying');
        expect(out).not.toContain('s3cret');
        expect(out).not.toContain('abc');
    });

    it('redacts credential fields in a stringified object', () => {
        expect(redactText('{"user":"bob","pass":"s3cret","name":"NPO 1"}')).toBe(
            '{"user":"REDACTED","pass":"REDACTED","name":"NPO 1"}',
        );
    });

    it('still redacts a secret truncated mid-value', () => {
        // debug.ts caps entries at 500 chars, so the tail is routinely lost.
        expect(redactText('GET http://h/get.php?password=s3cr')).not.toContain('s3cr');
    });

    it('leaves an ordinary log line untouched', () => {
        const line = 'storage demoted to memory: quota exceeded (key=value pairs kept)';
        expect(redactText(line)).toBe(line);
    });
});

describe('redactJsonCredentialFields', () => {
    it('masks user_info credentials and nothing else', () => {
        expect(redactJsonCredentialFields('{"username":"bob","password":"s3cret","key":"keep","auth":1}')).toBe(
            '{"username":"REDACTED","password":"REDACTED","key":"keep","auth":1}',
        );
    });
});
