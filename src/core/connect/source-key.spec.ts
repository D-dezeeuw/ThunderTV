import { describe, expect, it } from 'vitest';
import { makeSourceKey, normalizeUrlKey } from './source-key';

describe('normalizeUrlKey', () => {
    it('lowercases scheme and host but preserves path/query case', () => {
        expect(normalizeUrlKey('HTTPS://Example.COM/Path/File.m3u?Token=AbC')).toBe(
            'https://example.com/Path/File.m3u?Token=AbC',
        );
    });

    it('strips a single trailing slash from the path', () => {
        expect(normalizeUrlKey('https://example.com/list/')).toBe('https://example.com/list');
    });

    it('never strips the root slash', () => {
        expect(normalizeUrlKey('https://example.com/')).toBe('https://example.com/');
    });

    it('trims surrounding whitespace', () => {
        expect(normalizeUrlKey('  https://example.com/list  ')).toBe('https://example.com/list');
    });

    it('keeps http and https distinct', () => {
        expect(normalizeUrlKey('http://example.com/list')).not.toBe(normalizeUrlKey('https://example.com/list'));
    });

    it('returns null for an unparseable URL', () => {
        expect(normalizeUrlKey('not a url')).toBeNull();
    });
});

describe('makeSourceKey', () => {
    it('keys an m3u-url source by normalized type+url', () => {
        expect(makeSourceKey('m3u-url', 'https://Example.com/list.m3u')).toBe(
            'm3u-url:https://example.com/list.m3u',
        );
    });

    it('two URLs differing only by scheme case/trailing slash produce the same key', () => {
        expect(makeSourceKey('m3u-url', 'HTTPS://example.com/list/')).toBe(
            makeSourceKey('m3u-url', 'https://example.com/list'),
        );
    });

    it('returns null for m3u-file (no reliable identity)', () => {
        expect(makeSourceKey('m3u-file', undefined)).toBeNull();
    });

    it('returns null for m3u-text (no reliable identity)', () => {
        expect(makeSourceKey('m3u-text', undefined)).toBeNull();
    });

    it('returns null for m3u-url with no url', () => {
        expect(makeSourceKey('m3u-url', undefined)).toBeNull();
    });

    it('includes the user segment for xtream when provided', () => {
        expect(makeSourceKey('xtream', 'https://provider.example.com', 'alice')).toBe(
            'xtream:https://provider.example.com/:alice',
        );
    });

    it('returns null for an unparseable url', () => {
        expect(makeSourceKey('m3u-url', 'not a url')).toBeNull();
    });
});
