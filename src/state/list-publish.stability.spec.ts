import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { resetState, tick } from 'spektrum';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChannelRow } from '../m3u/types';
import { setEpgProgramIndex } from './epg-index';
import { LIST_VISIBLE_ROWS } from './list';
import { publishListWindow, resetListPublishForTests } from './list-publish';
import { get } from './typed';

/**
 * The "scrolling Live/Radio ping-pongs" bug, at its source.
 *
 * `publishListWindow()` runs on every scroll frame. A row needing EPG or
 * health enrichment used to be spread into a brand-new object each time, so
 * the published array had entirely fresh identities every frame. Spektrum's
 * `data-each` diffs keyless lists by identity over a prefix scan: a mismatch
 * at index 0 makes it destroy and rebuild *every* row clone. Mid-scroll that
 * collapses the list container's height, the browser clamps `scrollTop` to
 * the smaller scrollHeight, and the resulting scroll event republishes at a
 * different position — the loop the user saw.
 *
 * Categories was unaffected because its rows need no enrichment and come
 * back from the fast path with their identity intact, which is exactly the
 * property these tests pin for Live and Radio too.
 */
const NOW_TITLE = 'Evening News';

function row(id: string, over: Partial<ChannelRow> = {}): ChannelRow {
    return { id, name: `Channel ${id}`, url: `http://example.test/${id}`, group: null, logo: null, tvgId: null, radio: false, ...over };
}

describe('publishListWindow row identity', () => {
    beforeEach(() => {
        resetListPublishForTests();
    });

    afterEach(() => {
        setEpgProgramIndex(new Map());
        resetListPublishForTests();
        resetState();
    });

    function published(): readonly ChannelRow[] {
        return get<ChannelRow[]>(LIST_VISIBLE_ROWS) ?? [];
    }

    it('hands back the very same objects when an un-enriched window is republished', () => {
        const window = [row('a'), row('b'), row('c')];
        publishListWindow(window, 0, 0);
        tick();
        const first = [...published()];

        publishListWindow(window, 0, 0);
        tick();
        const second = published();

        expect(second[0]).toBe(first[0]);
        expect(second[1]).toBe(first[1]);
        expect(second[2]).toBe(first[2]);
    });

    it('keeps EPG-enriched rows stable across republishes of the same window', () => {
        // One programme, running now, on the channel row 'a' is matched to.
        const now = Date.now();
        setEpgProgramIndex(
            new Map([
                [
                    'chan.nl',
                    [
                        { channelId: 'chan.nl', start: now - 60_000, stop: now + 60_000, title: NOW_TITLE, description: null },
                        { channelId: 'chan.nl', start: now + 60_000, stop: now + 120_000, title: 'Next Up', description: null },
                    ],
                ],
            ]),
        );

        const window = [row('a', { epgId: 'chan.nl' }), row('b')];
        publishListWindow(window, 0, 0);
        tick();
        const first = [...published()];
        // The enriched row really is a different object from its base — this
        // is the path that used to re-allocate every frame.
        expect(first[0]).not.toBe(window[0]);
        expect(first[0]?.epgNowTitle).toBe(NOW_TITLE);

        publishListWindow(window, 0, 0);
        tick();
        expect(published()[0]).toBe(first[0]);
    });

    it('re-derives into the same object when the underlying row is replaced', () => {
        const before = [row('a', { logo: 'http://example.test/one.png' })];
        publishListWindow(before, 0, 0);
        tick();
        const first = published()[0];

        const after = [row('a', { logo: 'http://example.test/two.png' })];
        publishListWindow(after, 0, 0);
        tick();
        // Same object, new value: the clone bound to it only re-scopes when
        // its index moves, so a fresh object here would never be read.
        expect(published()[0]).toBe(first);
        expect(published()[0]?.logo).toBe('http://example.test/two.png');
    });
});

describe('the channel list markup', () => {
    it('keys its data-each, so a window change re-binds rows instead of rebuilding them', () => {
        const repoRoot = fileURLToPath(new NodeURL('../..', import.meta.url));
        const indexHtml = readFileSync(`${repoRoot}/index.html`, 'utf8');
        const rowsEach = /<div class="rows"[^>]*>/.exec(indexHtml)?.[0] ?? '';
        expect(rowsEach).toContain('data-each="list.visibleRows"');
        expect(rowsEach).toContain('data-key="item.id"');
    });
});
