import { setValue, tick } from 'spektrum';
import { describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { mountTemplate } from '../shared/testing/bind-dom';
import { DOWNLOADS_ITEMS, type DownloadEntry } from './downloads';
import { seedPlatformDiagnostics } from './ui';
import { VOD_DETAIL_ID } from './vod';

/**
 * Proof that the download controls in `index.html` render and dispatch what
 * they claim — hand-authored fragments mirroring the real markup's
 * bindings, per `catalog-views.markup.spec.ts`'s convention (nothing in
 * this codebase parses index.html directly).
 *
 * The two behaviours worth pinning: the detail panel's buttons really do go
 * inert while that movie is downloading (`:disabled` binds the DOM
 * *property* for a dash-free attribute name, which is the whole reason it
 * works), and the queue's per-row Cancel carries its own entry's id rather
 * than the active one.
 */
/**
 * `bootstrap()` — not `initState()` — is what mirrors the live capabilities
 * into state, so a mounted fragment has to do the same or `download.supported`
 * correctly reads its safe default and hides the button.
 */
function seedCapabilities(downloads: 'managed' | 'handoff' | 'none' = 'managed'): void {
    seedPlatformDiagnostics('web', { corsUnrestricted: false, externalPlayers: false, durableStorage: 'none', downloads }, 'none');
}

function entry(overrides: Partial<DownloadEntry> = {}): DownloadEntry {
    return {
        id: 'vod:10',
        name: 'Movie A',
        filename: 'Movie A.mkv',
        status: 'downloading',
        percent: 42,
        sizeLabel: '420 MB / 1 GB',
        errorReason: null,
        ...overrides,
    };
}

const DETAIL_ACTIONS = `
    <div>
        <button
            type="button"
            data-action="click"
            data-fn="vod/play"
            :disabled="download.detailBusy"
            data-testid="play"
        >Play</button>
        <button
            type="button"
            data-if="download.supported && !download.detailBusy"
            data-action="click"
            data-fn="downloads/startVod"
            data-testid="download"
        >Download</button>
        <div data-if="download.detailBusy" data-testid="progress">
            <progress data-if="download.detailMeasured" max="100" :value="download.detailPercent" data-testid="bar"></progress>
            <span data-testid="size">{{ download.detail.sizeLabel }}</span>
            <button type="button" data-action="click" data-fn="downloads/cancel" :data-download-id="download.detail.id" data-testid="cancel"></button>
        </div>
    </div>
`;

describe('movie detail download controls', () => {
    it('shows the Download button and leaves Play enabled when nothing is downloading', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(DETAIL_ACTIONS);
            seedCapabilities();
            setValue(VOD_DETAIL_ID, 10);
            setValue(DOWNLOADS_ITEMS, []);
            tick();

            expect((mounted.query('[data-testid="play"]') as HTMLButtonElement).disabled).toBe(false);
            expect(mounted.query('[data-testid="download"]')?.style.display).not.toBe('none');
            expect(mounted.query('[data-testid="progress"]')?.style.display).toBe('none');
            mounted.cleanup();
        });
    });

    it('disables Play, hides Download, and shows progress + cancel while this movie is downloading', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(DETAIL_ACTIONS);
            seedCapabilities();
            setValue(VOD_DETAIL_ID, 10);
            setValue(DOWNLOADS_ITEMS, [entry()]);
            tick();

            expect((mounted.query('[data-testid="play"]') as HTMLButtonElement).disabled).toBe(true);
            expect(mounted.query('[data-testid="download"]')?.style.display).toBe('none');
            expect(mounted.query('[data-testid="progress"]')?.style.display).not.toBe('none');
            expect((mounted.query('[data-testid="bar"]') as HTMLProgressElement).value).toBe(42);
            expect(mounted.query('[data-testid="size"]')?.textContent).toContain('420 MB / 1 GB');
            expect(mounted.query('[data-testid="cancel"]')?.getAttribute('data-download-id')).toBe('vod:10');
            mounted.cleanup();
        });
    });

    it('leaves the panel usable again once the download finishes', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(DETAIL_ACTIONS);
            seedCapabilities();
            setValue(VOD_DETAIL_ID, 10);
            setValue(DOWNLOADS_ITEMS, [entry({ status: 'done', percent: 100 })]);
            tick();

            expect((mounted.query('[data-testid="play"]') as HTMLButtonElement).disabled).toBe(false);
            expect(mounted.query('[data-testid="progress"]')?.style.display).toBe('none');
            mounted.cleanup();
        });
    });

    it('hides the Download button entirely on a host that cannot save files', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(DETAIL_ACTIONS);
            seedCapabilities('none');
            setValue(VOD_DETAIL_ID, 10);
            setValue(DOWNLOADS_ITEMS, []);
            tick();

            // Offering a control that cannot work is worse than not offering
            // it — Play stays available, so the panel is not degraded.
            expect(mounted.query('[data-testid="download"]')?.style.display).toBe('none');
            expect((mounted.query('[data-testid="play"]') as HTMLButtonElement).disabled).toBe(false);
            mounted.cleanup();
        });
    });

    it("another movie's download does not disable this one's panel", async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(DETAIL_ACTIONS);
            seedCapabilities();
            setValue(VOD_DETAIL_ID, 10);
            setValue(DOWNLOADS_ITEMS, [entry({ id: 'vod:11' })]);
            tick();

            expect((mounted.query('[data-testid="play"]') as HTMLButtonElement).disabled).toBe(false);
            mounted.cleanup();
        });
    });

    it('hides the bar in favour of an indeterminate one when there is no total to measure against', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(DETAIL_ACTIONS);
            seedCapabilities();
            setValue(VOD_DETAIL_ID, 10);
            setValue(DOWNLOADS_ITEMS, [entry({ percent: -1 })]);
            tick();

            expect(mounted.query('[data-testid="bar"]')?.style.display).toBe('none');
            mounted.cleanup();
        });
    });
});

describe('download queue panel', () => {
    const QUEUE = `
        <aside data-if="download.queueVisible" data-testid="queue">
            <button data-if="download.hasFinished" data-action="click" data-fn="downloads/clearFinished" data-testid="clear"></button>
            <ul data-each="download.rows" data-as="row">
                <li>
                    <span data-testid="name">{{ row.name }}</span>
                    <button data-if="row.busy" data-action="click" data-fn="downloads/cancel" :data-download-id="row.id" data-testid="row-cancel"></button>
                    <button data-if="!row.busy" data-action="click" data-fn="downloads/dismiss" :data-download-id="row.id" data-testid="row-dismiss"></button>
                </li>
            </ul>
        </aside>
    `;

    it('stays hidden while the queue is empty', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(QUEUE);
            setValue(DOWNLOADS_ITEMS, []);
            tick();

            expect(mounted.query('[data-testid="queue"]')?.style.display).toBe('none');
            mounted.cleanup();
        });
    });

    it('renders one row per entry, each carrying its own id on the right control', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(QUEUE);
            setValue(DOWNLOADS_ITEMS, [entry(), entry({ id: 'vod:11', name: 'Movie B', status: 'done' })]);
            tick();

            expect(mounted.queryAll('[data-testid="name"]').map((el) => el.textContent?.trim())).toEqual([
                'Movie A',
                'Movie B',
            ]);
            // The running entry offers Cancel; the finished one offers Remove.
            const cancels = mounted.queryAll('[data-testid="row-cancel"]').filter((el) => el.style.display !== 'none');
            const dismisses = mounted.queryAll('[data-testid="row-dismiss"]').filter((el) => el.style.display !== 'none');
            expect(cancels.map((el) => el.getAttribute('data-download-id'))).toEqual(['vod:10']);
            expect(dismisses.map((el) => el.getAttribute('data-download-id'))).toEqual(['vod:11']);
            mounted.cleanup();
        });
    });

    it('offers "clear finished" only once something has finished', async () => {
        await withFakePlatform({}, () => {
            const mounted = mountTemplate(QUEUE);
            setValue(DOWNLOADS_ITEMS, [entry()]);
            tick();
            expect(mounted.query('[data-testid="clear"]')?.style.display).toBe('none');

            setValue(DOWNLOADS_ITEMS, [entry({ status: 'done' })]);
            tick();
            expect(mounted.query('[data-testid="clear"]')?.style.display).not.toBe('none');
            mounted.cleanup();
        });
    });
});
