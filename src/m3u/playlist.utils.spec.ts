import { describe, expect, it } from 'vitest';
import {
    getExtensionFromUrl,
    getFilenameFromUrl,
    getStreamExtensionFromUrl,
} from './playlist.utils';

/**
 * Ported from thunder-tv's `playlist.utils.spec.ts` (Feature 06.1.7),
 * trimmed to the three functions this file still exports (Feature 06.1.8's
 * decision note) — `getFilenameFromUrl` gains its own basic coverage since
 * the original suite never exercised it directly.
 */
describe('getFilenameFromUrl', () => {
    it('returns the last path segment', () => {
        expect(getFilenameFromUrl('https://host/path/file.m3u8')).toBe('file.m3u8');
    });

    it('falls back to "Untitled playlist" for an empty or single-char value', () => {
        expect(getFilenameFromUrl('')).toBe('Untitled playlist');
        expect(getFilenameFromUrl('x')).toBe('Untitled playlist');
    });
});

describe('getExtensionFromUrl', () => {
    it.each([
        ['https://host/path/file.ts?token=x', 'ts'],
        ['https://host/ace/getstream?infohash=x', undefined],
        ['https://host/path.with.dots/stream?x=y', undefined],
        ['https://host/path/file.m3u8', 'm3u8'],
        ['https://host/path/.ts', undefined],
    ])('extracts the path extension from %s', (url, expected) => {
        expect(getExtensionFromUrl(url)).toBe(expected);
    });
});

describe('getStreamExtensionFromUrl', () => {
    it.each([
        ['https://host/play?extension=m3u8&token=x', 'm3u8'],
        ['https://host/live.php?stream=123&extension=ts', 'ts'],
        ['https://host/path/file.ts?token=x', 'ts'],
        ['https://host/ace/getstream?infohash=x', undefined],
    ])('prefers declared stream extension metadata from %s', (url, expected) => {
        expect(getStreamExtensionFromUrl(url)).toBe(expected);
    });
});
