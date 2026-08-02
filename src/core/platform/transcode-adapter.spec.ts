import { describe, expect, it } from 'vitest';
import { buildTranscodeStreamUrl } from './transcode-adapter';

/**
 * The escaping is the whole risk: a provider URL routinely carries `?`,
 * `&`, `+` and credentials in its path, and one of those landing unescaped
 * turns "play this film from 12s" into a request for something else
 * entirely — or, worse, into a `t=` the transcoder reads from the film's own
 * query string.
 */
describe('buildTranscodeStreamUrl', () => {
    const origin = 'http://127.0.0.1:52301';

    it('escapes the source URL, query string and all', () => {
        const url = new URL(buildTranscodeStreamUrl(origin, 'tok', 'http://p.tv:8080/movie/u/p+w/9.mkv?t=1&x=2', 0));

        expect(url.origin).toBe(origin);
        expect(url.pathname).toBe('/stream');
        expect(url.searchParams.get('src')).toBe('http://p.tv:8080/movie/u/p+w/9.mkv?t=1&x=2');
        expect(url.searchParams.get('token')).toBe('tok');
        expect(url.searchParams.get('t')).toBe('0.000');
    });

    it('passes the seek position through at millisecond precision', () => {
        const url = new URL(buildTranscodeStreamUrl(origin, 'tok', 'http://p.tv/9.mkv', 3612.5));
        expect(url.searchParams.get('t')).toBe('3612.500');
    });

    it('never asks for a negative or nonsensical position', () => {
        for (const at of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(new URL(buildTranscodeStreamUrl(origin, 'tok', 'http://p.tv/9.mkv', at)).searchParams.get('t')).toBe('0.000');
        }
    });
});
