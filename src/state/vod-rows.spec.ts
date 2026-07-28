import { describe, expect, it } from 'vitest';
import { toVodDetail, vodItemToRow } from './vod-rows';
import type { VodItem } from './vod';

const item: VodItem = {
    streamId: 42,
    name: '| WK | Movie Title',
    categoryId: '1',
    containerExtension: 'mp4',
    icon: 'poster.jpg',
    rating: '8.1',
    year: '2020',
    searchKey: 'movie title',
};

describe('vod-rows name cleaning (Issue 1 wiring)', () => {
    it('vodItemToRow() strips a leading provider decoration tag from the row name', () => {
        expect(vodItemToRow(item, null, null).name).toBe('Movie Title');
    });

    it('toVodDetail() strips a leading provider decoration tag from the detail name', () => {
        expect(toVodDetail(item, null).name).toBe('Movie Title');
    });
});
