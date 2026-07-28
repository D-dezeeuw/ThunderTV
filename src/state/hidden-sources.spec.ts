import { describe, expect, it } from 'vitest';
import { isHiddenSource, visibleSources } from './hidden-sources';
import type { PlaylistSourceSummary } from './playlist';

function source(url: string | null, id = url ?? 'x'): PlaylistSourceSummary {
    return {
        id,
        type: 'm3u-url',
        name: id,
        url,
        channelCount: 0,
        groupCount: 0,
        radioCount: 0,
        drmCount: 0,
        skipped: 0,
        importDate: 0,
        lastRefresh: null,
        needsReupload: false,
    };
}

describe('hidden sources', () => {
    it('matches the dead host regardless of scheme, port, path or credentials', () => {
        expect(isHiddenSource(source('http://line.cloud-ott.net'))).toBe(true);
        expect(isHiddenSource(source('http://line.cloud-ott.net:8080/get.php?username=a&password=b'))).toBe(true);
        expect(isHiddenSource(source('https://LINE.CLOUD-OTT.NET/playlist.m3u'))).toBe(true);
        // A stored URL with no scheme must not be read as scheme + path.
        expect(isHiddenSource(source('line.cloud-ott.net:8080'))).toBe(true);
    });

    it('leaves every other source alone, including uploads with no URL', () => {
        expect(isHiddenSource(source('http://provider.example:8080'))).toBe(false);
        expect(isHiddenSource(source(null, 'pasted'))).toBe(false);
        // Substring lookalikes are a different host.
        expect(isHiddenSource(source('http://line.cloud-ott.net.evil.test'))).toBe(false);
        expect(isHiddenSource(source('http://notline.cloud-ott.net'))).toBe(false);
    });

    it('visibleSources filters the picker without touching the underlying list', () => {
        const all = [source('http://a.test', 'a'), source('http://line.cloud-ott.net', 'dead'), source(null, 'file')];
        expect(visibleSources(all).map((s) => s.id)).toEqual(['a', 'file']);
        // Hidden, never deleted — the source is still in the array it came from.
        expect(all).toHaveLength(3);
    });
});
