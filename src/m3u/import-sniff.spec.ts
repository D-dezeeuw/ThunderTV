import { describe, expect, it } from 'vitest';
import { contentFingerprint, looksLikeM3u } from './import-sniff';

describe('looksLikeM3u (Feature 07.2.2/07.3.2/07.4.8)', () => {
    it('accepts a real #EXTM3U header', () => {
        expect(looksLikeM3u('#EXTM3U\n#EXTINF:-1,One\nhttp://x/1.m3u8\n')).toBe(true);
    });

    it('accepts header-less text that still has an #EXTINF line', () => {
        expect(looksLikeM3u('#EXTINF:-1,One\nhttp://x/1.m3u8\n')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(looksLikeM3u('#extm3u\n')).toBe(true);
    });

    it('rejects JSON', () => {
        expect(looksLikeM3u('{"channels":[]}')).toBe(false);
    });

    it('rejects HTML (a common "provider returned an error page" shape)', () => {
        expect(looksLikeM3u('<!DOCTYPE html><html><body>404</body></html>')).toBe(false);
    });

    it('rejects an empty string', () => {
        expect(looksLikeM3u('')).toBe(false);
    });
});

describe('contentFingerprint (Feature 07.7.6)', () => {
    it('is stable for identical text', () => {
        const text = '#EXTM3U\n#EXTINF:-1,One\nhttp://x/1.m3u8\n';
        expect(contentFingerprint(text)).toBe(contentFingerprint(text));
    });

    it('differs for different text', () => {
        expect(contentFingerprint('#EXTM3U\nA')).not.toBe(contentFingerprint('#EXTM3U\nB'));
    });

    it('differs for different lengths even with an identical 64KB prefix', () => {
        const base = 'x'.repeat(65_536);
        expect(contentFingerprint(base)).not.toBe(contentFingerprint(base + 'y'));
    });

    it('encodes the exact text length as the first segment', () => {
        const text = '#EXTM3U\nhello';
        expect(contentFingerprint(text).split(':')[0]).toBe(String(text.length));
    });
});
