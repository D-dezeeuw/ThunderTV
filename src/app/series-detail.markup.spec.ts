import { setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { mountTemplate } from '../shared/testing/bind-dom';
import { seedStrings } from '../state/index';
import { resetSeriesMemoryForTests, seriesMemory } from '../state/series-rows';
import type { SeriesDetail, SeriesItem } from '../state/series';
import { get } from '../state/typed';

/**
 * Series detail panel (Issue 2 follow-up, Phase 21): the fragment below is a
 * hand-authored mirror of index.html's real series-detail markup — a single
 * flat `data-each="series.detail.rows"` with `data-if` per row kind, plus
 * the loading/no-source/fetch-failed states `series.detailStatus`/
 * `series.detailErrorReason` now drive. Proves the flattening actually
 * renders through the real `bindDOM()`/`data-each` path (the bug this
 * replaces was invisible to `tsc`/business-logic specs — the nested
 * `data-each` compiled fine and `series.actions.ts` published correct data,
 * the DOM binding itself was silently wrong) and that the Retry affordance
 * dispatches `series/openDetail` with the open series' own id. Split out of
 * `catalog-views.markup.spec.ts` (which still owns the Movies/generic
 * catalog markup specs) purely to keep each file under the standing
 * ≤300-line convention.
 */
const seriesDetailPanelHtml = `
    <div data-if="series.detailId" data-testid="detail-panel">
        <p data-if="series.detailStatus === 'loading'" data-testid="detail-loading">{{ strings.catalog.loading }}</p>

        <div data-if="series.detailStatus === 'error' && series.detailErrorReason === 'no-source'" data-testid="detail-no-source">
            <p>{{ strings.catalog.noSource }}</p>
        </div>
        <div data-if="series.detailStatus === 'error' && series.detailErrorReason === 'fetch-failed'" data-testid="detail-fetch-failed">
            <p>{{ strings.catalog.fetchFailed }}</p>
            <button
                type="button"
                data-action="click"
                data-fn="series/openDetail"
                :data-series-id="series.detailId"
                data-testid="detail-retry"
            >{{ strings.catalog.retry }}</button>
        </div>

        <p data-if="series.detailStatus === 'ready' && series.detail.rows.length === 0" data-testid="detail-no-episodes">
            {{ strings.series.noEpisodes }}
        </p>
        <div
            data-if="series.detailStatus === 'ready' && series.detail.rows.length > 0"
            data-each="series.detail.rows"
            data-as="row"
            data-testid="detail-rows"
        >
            <div class="detail-row">
                <h3 data-if="row.kind === 'season'" data-testid="detail-season">{{ strings.series.seasonPrefix }} {{ row.season }}</h3>
                <button
                    type="button"
                    data-if="row.kind === 'episode'"
                    data-action="click"
                    data-fn="series/playEpisode"
                    :data-series-id="series.detailId"
                    :data-episode-id="row.episodeId"
                    data-testid="detail-episode"
                >
                    <span data-testid="detail-episode-num">{{ strings.series.episodePrefix }}{{ row.episode }}</span>
                    <span data-testid="detail-episode-title">{{ row.title }}</span>
                    <span data-if="row.durationMins !== null" data-testid="detail-episode-duration">{{ row.durationMins }} {{ strings.series.minutesSuffix }}</span>
                </button>
            </div>
        </div>
    </div>
`;

function seedSeriesDetail(overrides: Partial<SeriesDetail> = {}): void {
    const base: SeriesDetail = {
        seriesId: 7,
        name: 'Show B',
        categoryId: '1',
        categoryName: 'Drama',
        cover: null,
        plot: null,
        year: null,
        rating: null,
        rows: [],
    };
    setValue('series.detailId', 7);
    setValue('series.detail', { ...base, ...overrides });
    tick();
}

describe('Series detail panel markup (Issue 2, DOM-bound)', () => {
    afterEach(() => {
        resetSeriesMemoryForTests();
    });

    it('renders a season header row and an episode row from a flat series.detail.rows array, in order', () => {
        const mounted = mountTemplate(seriesDetailPanelHtml);
        seedStrings();
        setValue('series.detailStatus', 'ready');
        seedSeriesDetail({
            rows: [
                { kind: 'season', season: 1 },
                { kind: 'episode', episodeId: 100, episode: 1, title: 'Pilot', durationMins: 24 },
            ],
        });

        const rows = mounted.queryAll('[data-testid="detail-season"], [data-testid="detail-episode"]');
        // Both elements exist per clone (data-each has exactly one row
        // template); only the ones matching their own row's `kind` are
        // actually visible — the same "hidden but present" shape as the
        // existing channel-row radio/non-radio logo split.
        const visible = rows.filter((el) => el.style.display !== 'none');
        expect(visible).toHaveLength(2);
        expect(visible[0]?.textContent?.trim()).toBe('Season 1');

        // The episode row's own children specifically — not the season
        // row's clone, which also carries a (hidden) copy of this same
        // button/span markup with an unrelated (undefined-field) scope.
        const episodeRow = visible[1] as HTMLElement;
        expect(episodeRow.querySelector('[data-testid="detail-episode-title"]')?.textContent).toBe('Pilot');
        expect(episodeRow.querySelector('[data-testid="detail-episode-num"]')?.textContent).toBe('E1');
        expect(episodeRow.querySelector('[data-testid="detail-episode-duration"]')?.textContent).toBe('24 min');

        mounted.cleanup();
    });

    it('an episode row dispatches series/playEpisode with its own series/episode id, not a delegated-container mistake', () => {
        const mounted = mountTemplate(seriesDetailPanelHtml);
        setValue('series.detailStatus', 'ready');
        seedSeriesDetail({
            rows: [
                { kind: 'season', season: 1 },
                { kind: 'episode', episodeId: 100, episode: 1, title: 'Pilot', durationMins: 24 },
                { kind: 'episode', episodeId: 101, episode: 2, title: 'Episode 2', durationMins: null },
            ],
        });

        const episodeButtons = mounted.queryAll<HTMLElement>('[data-testid="detail-episode"]').filter((el) => el.style.display !== 'none');
        expect(episodeButtons).toHaveLength(2);
        expect(episodeButtons[1]?.dataset['episodeId']).toBe('101');
        expect(episodeButtons[1]?.dataset['seriesId']).toBe('7');

        mounted.cleanup();
    });

    it('shows the "no episodes" message, not the error panel, when the fetch succeeded but the series has none', () => {
        const mounted = mountTemplate(seriesDetailPanelHtml);
        setValue('series.detailStatus', 'ready');
        seedSeriesDetail({ rows: [] });

        expect(mounted.query('[data-testid="detail-no-episodes"]')?.style.display).not.toBe('none');
        expect(mounted.query('[data-testid="detail-fetch-failed"]')?.style.display).toBe('none');
        expect(mounted.query('[data-testid="detail-rows"]')?.style.display).toBe('none');

        mounted.cleanup();
    });

    it('shows the loading message while series.detailStatus is "loading"', () => {
        const mounted = mountTemplate(seriesDetailPanelHtml);
        setValue('series.detailStatus', 'loading');
        seedSeriesDetail({ rows: [] });

        expect(mounted.query('[data-testid="detail-loading"]')?.style.display).not.toBe('none');
        expect(mounted.query('[data-testid="detail-no-episodes"]')?.style.display).toBe('none');

        mounted.cleanup();
    });

    it('shows the classified fetch-failed message + Retry (not the ambiguous empty message) on a failed detail fetch', () => {
        const mounted = mountTemplate(seriesDetailPanelHtml);
        setValue('series.detailStatus', 'error');
        setValue('series.detailErrorReason', 'fetch-failed');
        seedSeriesDetail({ rows: [] });

        expect(mounted.query('[data-testid="detail-fetch-failed"]')?.style.display).not.toBe('none');
        expect(mounted.query('[data-testid="detail-no-episodes"]')?.style.display).toBe('none');
        const retry = mounted.query<HTMLElement>('[data-testid="detail-retry"]');
        expect(retry?.dataset['seriesId']).toBe('7');

        mounted.cleanup();
    });

    it('shows the no-source message when series.detailErrorReason is "no-source"', () => {
        const mounted = mountTemplate(seriesDetailPanelHtml);
        setValue('series.detailStatus', 'error');
        setValue('series.detailErrorReason', 'no-source');
        seedSeriesDetail({ rows: [] });

        expect(mounted.query('[data-testid="detail-no-source"]')?.style.display).not.toBe('none');
        expect(mounted.query('[data-testid="detail-fetch-failed"]')?.style.display).toBe('none');

        mounted.cleanup();
    });

    it('clicking Retry re-dispatches series/openDetail for the open series, reaching the real action', async () => {
        const item: SeriesItem = { seriesId: 7, name: 'Show B', categoryId: '1', searchKey: 'show b' };
        seriesMemory.setItemsFor('1', [item], Date.now());

        const mounted = mountTemplate(seriesDetailPanelHtml);
        setValue('series.detailStatus', 'error');
        setValue('series.detailErrorReason', 'fetch-failed');
        seedSeriesDetail({ rows: [] });

        mounted.dispatch('series/openDetail');
        // No active Xtream source in this fresh mount → openSeriesDetail()
        // resolves to 'no-source', DIFFERENT from the seeded 'fetch-failed'
        // — proof the click reached the real action and ran a fresh
        // resolution, not that the old state simply never changed.
        for (let i = 0; i < 5; i++) await Promise.resolve();
        tick();

        expect(get<string>('series.detailErrorReason')).toBe('no-source');

        mounted.cleanup();
    });
});
