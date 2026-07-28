import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, parseHash, resolveRoute } from './router';

describe('parseHash', () => {
    it('parses a bare path with no query', () => {
        expect(parseHash('#/favorites')).toEqual({
            path: 'favorites',
            params: new URLSearchParams(''),
        });
    });

    it('treats no hash as an empty path', () => {
        expect(parseHash('')).toEqual({ path: '', params: new URLSearchParams('') });
    });

    it('treats a bare "#" as an empty path', () => {
        expect(parseHash('#')).toEqual({ path: '', params: new URLSearchParams('') });
    });

    it('treats a bare "#/" as an empty path', () => {
        expect(parseHash('#/')).toEqual({ path: '', params: new URLSearchParams('') });
    });

    it('extracts connect params', () => {
        const { path, params } = parseHash('#/connect?type=xtream&url=http%3A%2F%2Fhost&user=abc');
        expect(path).toBe('connect');
        expect(params.get('type')).toBe('xtream');
        expect(params.get('url')).toBe('http://host');
        expect(params.get('user')).toBe('abc');
    });

    it('handles a malformed query section without throwing', () => {
        const { path, params } = parseHash('#/connect?&&type=xtream&=&');
        expect(path).toBe('connect');
        expect(params.get('type')).toBe('xtream');
    });

    it('handles a path with a trailing "?" and no query', () => {
        expect(parseHash('#/sources?').path).toBe('sources');
    });
});

describe('resolveRoute', () => {
    it('resolves a known route', () => {
        expect(resolveRoute('guide')).toBe('guide');
    });

    it('resolves the movies route (Phase 21)', () => {
        expect(resolveRoute('movies')).toBe('movies');
    });

    it('resolves the series route (Phase 21)', () => {
        expect(resolveRoute('series')).toBe('series');
    });

    it('falls back to the default route for an unknown path', () => {
        expect(resolveRoute('bogus')).toBe(DEFAULT_ROUTE);
    });

    it('falls back to the default route for an empty path', () => {
        expect(resolveRoute('')).toBe(DEFAULT_ROUTE);
    });
});
