import { tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { mountTemplate } from '../shared/testing/bind-dom';
import type { FavoriteRecord } from '../core/storage';
import { publishFavorites } from '../state/favorites';

/**
 * The bug this exists to keep fixed: starring a channel wrote the snapshot
 * and lit the row's star, but the Starred tab was a hard-coded empty state,
 * so the channel never appeared anywhere. This binds the real view fragment
 * (index.html's `view-favorites` section) and proves the round trip —
 * published rows render, and clicking the unstar control reaches the real
 * `favorites/row` action rather than replaying the channel.
 *
 * Hand-authored fragment mirroring the real markup's bindings, not the file
 * itself — see `catalog-views.markup.spec.ts` for why.
 */
const STARRED_VIEW = `
    <div class="empty-state" data-if="hasNoFavorites" data-testid="starred-empty"></div>
    <ul
        data-if="!hasNoFavorites"
        data-each="favorites.rows"
        data-testid="starred-list"
        data-action="click"
        data-fn="favorites/row"
    >
        <li :data-id="item.id">
            <button type="button" data-testid="starred-play">
                <span data-testid="starred-name">{{ item.name }}</span>
            </button>
            <button type="button" data-favorite-unstar data-testid="starred-unstar">★</button>
        </li>
    </ul>
`;

function favorite(id: string, name: string, addedAt: number): FavoriteRecord {
    return {
        v: 1,
        id,
        name,
        streamUrl: `https://example.com/${id}.m3u8`,
        logo: null,
        group: 'News',
        sourceId: 'p1',
        addedAt,
    };
}

describe('Starred view markup (Phase 13, DOM-bound)', () => {
    it('renders published favorites and swaps the empty state out', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(STARRED_VIEW);
            tick();
            expect(mounted.query('[data-testid="starred-empty"]')?.style.display).not.toBe('none');

            publishFavorites([favorite('p1:0', 'News Channel', 1), favorite('p1:1', 'Sports', 2)]);
            tick();

            expect(mounted.query('[data-testid="starred-empty"]')?.style.display).toBe('none');
            const names = mounted.queryAll('[data-testid="starred-name"]').map((el) => el.textContent);
            expect(names).toEqual(['Sports', 'News Channel']);

            mounted.cleanup();
        });
    });

    it('clicking the unstar control removes that row, without playing it', async () => {
        await withFakePlatform({}, async ({ storage }) => {
            await storage.bulkPut('favorites', [favorite('p1:0', 'News Channel', 1)], (r) => r.id);
            const mounted = mountTemplate(STARRED_VIEW);
            publishFavorites([favorite('p1:0', 'News Channel', 1)]);
            tick();

            mounted.query('[data-testid="starred-unstar"]')?.click();
            for (let i = 0; i < 5; i++) await Promise.resolve();
            tick();

            expect(await storage.getAll('favorites')).toHaveLength(0);
            expect(mounted.queryAll('[data-testid="starred-name"]')).toHaveLength(0);
            // The unstar button sits inside the row, so a delegated handler
            // that ignored the click target would have started playback here.
            expect(mounted.query('[data-testid="starred-empty"]')?.style.display).not.toBe('none');

            mounted.cleanup();
        });
    });
});
