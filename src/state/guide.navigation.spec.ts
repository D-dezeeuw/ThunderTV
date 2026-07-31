import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { resetMappingCacheForTests, saveMapping } from '../epg/match';
import { mountTemplate } from '../shared/testing/bind-dom';
import { setRows as setMemoryRows } from '../m3u/channel-memory';
import type { ChannelRow } from '../m3u/types';
import { EPG_TICK } from './epg';
import { GUIDE_CHANNELS, GUIDE_OFFSET_MS, GUIDE_SELECTED_KEY, type GuideChannel } from './guide';
import { playChannelByEpgId, shiftGuide } from './guide.actions';
import { registerGuideSelectors, type GuideView } from './guide.selectors';
import { GUIDE_MAX_OFFSET_MS, GUIDE_MIN_OFFSET_MS, GUIDE_SHIFT_MS } from './guide-time';
import { LIST_SELECTED_ID } from './list';
import { invalidateLiveRows } from './live-rows';
import { publishRowsForCurrentView, refreshLiveRows } from './live.actions';
import { PLAYER_ACTIVE } from './player';
import { isPlaybackHandoff } from './player.actions';
import type { ActiveChannelSnapshot } from './records';
import { get } from './typed';
import { UI_ACTIVE_VIEW } from './ui';

const HOUR = 60 * 60 * 1000;
/** A fixed instant so window/label assertions never depend on when the suite runs. */
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

afterEach(() => {
    resetState();
    invalidateLiveRows();
});

describe('guide time navigation', () => {
    it('shifts the window by half a window per step, and clamps at both travel limits', () => {
        setValue(GUIDE_OFFSET_MS, 0);
        tick();

        shiftGuide(GUIDE_SHIFT_MS);
        tick();
        expect(get<number>(GUIDE_OFFSET_MS)).toBe(GUIDE_SHIFT_MS);

        shiftGuide(GUIDE_MAX_OFFSET_MS * 2);
        tick();
        expect(get<number>(GUIDE_OFFSET_MS)).toBe(GUIDE_MAX_OFFSET_MS);

        shiftGuide(-GUIDE_MAX_OFFSET_MS * 4);
        tick();
        expect(get<number>(GUIDE_OFFSET_MS)).toBe(GUIDE_MIN_OFFSET_MS);
    });

    it('hides the now-line (nowPercent -1) once the window no longer contains "now", and restores it at offset 0', () => {
        const mounted = mountTemplate('<div></div>');
        registerGuideSelectors();
        setValue(GUIDE_CHANNELS, [
            { id: 'a.nl', displayName: 'A', icon: null, programs: [] } satisfies GuideChannel,
        ]);
        setValue(EPG_TICK, NOW);
        setValue(GUIDE_OFFSET_MS, 0);
        tick();
        expect(get<GuideView>('guide.view')?.nowPercent).toBeGreaterThanOrEqual(0);

        setValue(GUIDE_OFFSET_MS, 12 * HOUR);
        tick();
        const shifted = get<GuideView>('guide.view');
        expect(shifted?.nowPercent).toBe(-1);
        expect(shifted?.isShifted).toBe(true);
        // The date label only appears once shifted — while tracking the clock it is noise.
        expect(shifted?.dateLabel).not.toBe('');

        setValue(GUIDE_OFFSET_MS, 0);
        tick();
        const back = get<GuideView>('guide.view');
        expect(back?.isShifted).toBe(false);
        expect(back?.dateLabel).toBe('');

        mounted.cleanup();
    });
});

describe('playChannelByEpgId', () => {
    function row(id: string, name: string, epgId: string | null): ChannelRow {
        return { id, name, url: `http://x/${id}.ts`, group: null, logo: null, tvgId: null, radio: false, epgId };
    }

    /** Publishes one Live row carrying `epgId`, via the real Phase 31 path: a saved mapping keyed on the curated canonical key grouping.ts resolves "| NL | NPO 1" to. */
    async function publishRowWithEpgId(): Promise<void> {
        await saveMapping('NL', {
            matches: [{ channelKey: 'NPO 1', catalogId: 'NPO 1.nl', method: 'name' }],
            unmatchedChannels: [],
            unmatchedCatalog: [],
        });
        // `refreshLiveRows()` publishes whichever set the *active view* wants,
        // so the Live rows only get built once the view actually is Live.
        setValue(UI_ACTIVE_VIEW, 'live');
        tick();
        invalidateLiveRows();
        setMemoryRows([row('1', '| NL | NPO 1', null)]);
        refreshLiveRows();
        tick();
    }

    it('plays the Live row whose epgId matches the guide row', async () => {
        await withFakePlatform({}, async () => {
            const mounted = mountTemplate('<div></div>');
            await publishRowWithEpgId();

            expect(playChannelByEpgId('NPO 1.nl')).toBe(true);
            tick();

            const active = get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE);
            expect(active?.name).toBe('NPO 1');
            expect(active?.streamUrl).toBe('http://x/1.ts');
            expect(location.hash).toBe('#/live');

            mounted.cleanup();
            resetMappingCacheForTests();
        });
    });

    it('lands TV on that channel without the route change killing the stream it just started', async () => {
        await withFakePlatform({}, async () => {
            const mounted = mountTemplate('<div></div>');
            await publishRowWithEpgId();
            // Clicked from the Guide, so this is a real route change.
            location.hash = '#/guide';

            expect(playChannelByEpgId('NPO 1.nl')).toBe(true);
            tick();

            expect(location.hash).toBe('#/live');
            // The router stops playback on any genuine route change. Without
            // the exemption this navigation kills the very stream it exists
            // to show — which is what a bare `location.hash` write did here.
            expect(isPlaybackHandoff('live')).toBe(true);

            // Arriving at TV republishes its rows, which is what consumes the
            // queued reveal — the same path a Starred/Recent pick takes.
            publishRowsForCurrentView();
            tick();
            expect(get<string | null>(LIST_SELECTED_ID)).toBe('1');

            mounted.cleanup();
            resetMappingCacheForTests();
        });
    });

    it('opens the channel a programme block belongs to, and still marks the block selected', async () => {
        await withFakePlatform({}, async () => {
            const mounted = mountTemplate(`
                <button
                    data-program-key="NPO 1.nl|123"
                    data-epg-id="NPO 1.nl"
                    data-action="click"
                    data-fn="guide/openProgram"
                ></button>
            `);
            await publishRowWithEpgId();

            mounted.dispatch('guide/openProgram');
            tick();

            expect(get<string | null>(GUIDE_SELECTED_KEY)).toBe('NPO 1.nl|123');
            expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)?.name).toBe('NPO 1');

            mounted.cleanup();
            resetMappingCacheForTests();
        });
    });

    it('is a quiet no-op for a guide channel this subscription does not carry', async () => {
        await withFakePlatform({}, async () => {
            const mounted = mountTemplate('<div></div>');
            await publishRowWithEpgId();

            // The Guide describes the whole country's catalog, so it legitimately
            // lists channels no row can satisfy — that must not throw or navigate.
            expect(playChannelByEpgId('not-carried.nl')).toBe(false);
            expect(get<ActiveChannelSnapshot | null>(PLAYER_ACTIVE)).toBeNull();

            mounted.cleanup();
            resetMappingCacheForTests();
        });
    });
});
