import { resetState, setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { registerGuideSelectors } from './guide.selectors';
import type { GuideView } from './guide.selectors';
import { EPG_FEED_THROUGH } from './epg-settings';
import { EPG_TICK } from './epg';
import { GUIDE_CHANNELS, initGuideState } from './guide';
import { formatClockTime } from './guide-time';
import { SETTINGS_LOCALE } from './settings';
import { get } from './typed';

/**
 * Two Guide defects reported against the LG build, both of which the
 * simulation against the real `globetvapp/epg` Netherlands feed pinned down:
 *
 * 1. **"the time is wrong."** `formatClockTime()` passed no locale and no
 *    hour cycle, so it rendered whatever the *webview's* default locale
 *    preferred — `"02:30 PM"` on an en-US runtime where the programme is at
 *    14:30, clipped to `"02:30"` in a narrow guide cell.
 * 2. **"the blocks are not showing."** Every programme in that feed stops in
 *    October 2025; against a 2026 clock the grid is legitimately empty, but
 *    the generic "still fetching" empty state made a dead upstream source
 *    read as an app bug. `staleThroughLabel` is what lets it say so.
 */
describe('Guide clock formatting', () => {
    it('is 24-hour regardless of the locale the webview happens to boot in', () => {
        // 14:30 local time. Formatted in en-US, which is exactly the runtime default
        // that produced the "02:30" report.
        const afternoon = new Date(2026, 0, 15, 14, 30).getTime();
        const label = formatClockTime(afternoon, 'en-US');
        expect(label).not.toMatch(/[ap]\.?m\.?/i);
        expect(label).toMatch(/^\d{2}:\d{2}$/);
    });

    it('formats midnight as 00:xx, not 12:xx', () => {
        expect(formatClockTime(new Date(2026, 0, 15, 0, 5).getTime(), 'en-US')).toMatch(/^00:/);
    });
});

describe('Guide staleness notice', () => {
    afterEach(() => {
        resetState();
    });

    function view(): GuideView {
        return get<GuideView>('guide.view') as GuideView;
    }

    function boot(feedThrough: number, now: number): void {
        initGuideState();
        registerGuideSelectors();
        setValue(SETTINGS_LOCALE, 'en');
        setValue(GUIDE_CHANNELS, []);
        setValue(EPG_FEED_THROUGH, feedThrough);
        setValue(EPG_TICK, now);
        tick();
    }

    const NOW = Date.UTC(2026, 6, 30, 12, 0);

    it('names the last day the feed covers once it is in the past', () => {
        boot(Date.UTC(2025, 9, 28, 3, 24), NOW);
        expect(view().staleThroughLabel).not.toBe('');
        expect(view().staleThroughLabel).toContain('Oct');
    });

    it('stays silent while the feed still reaches into the future', () => {
        boot(NOW + 24 * 60 * 60 * 1000, NOW);
        expect(view().staleThroughLabel).toBe('');
    });

    it('stays silent before anything has been parsed, rather than accusing a fresh install', () => {
        boot(0, NOW);
        expect(view().staleThroughLabel).toBe('');
    });
});
