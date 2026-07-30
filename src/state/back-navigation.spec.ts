import { setValue, tick } from 'spektrum';
import { afterEach, describe, expect, it } from 'vitest';
import { closeTopmostOverlay } from './back-navigation';
import { DEBUG_OPEN } from './debug';
import { PLAYER_TRACK_MENU, type TrackMenu } from './player-tracks';
import { SERIES_DETAIL_ID } from './series';
import { get } from './typed';
import { UI_SETTINGS_OPEN } from './ui';
import { VOD_DETAIL_ID } from './vod';
import { UI_WIZARD_OPEN } from './wizard';

/**
 * The webOS app-self-checklist audit found the track menu wasn't part of
 * this stack (Back did nothing on a real remote, since the menu's own local
 * handler only reacted to a literal Escape key) — these cases exist so that
 * regression can't come back silently.
 */
afterEach(() => {
    setValue(PLAYER_TRACK_MENU, 'none');
    setValue(DEBUG_OPEN, false);
    setValue(UI_SETTINGS_OPEN, false);
    setValue(UI_WIZARD_OPEN, false);
    setValue(VOD_DETAIL_ID, null);
    setValue(SERIES_DETAIL_ID, null);
    tick();
});

describe('closeTopmostOverlay', () => {
    it('returns false when nothing is open', () => {
        expect(closeTopmostOverlay()).toBe(false);
    });

    it('closes an open track menu and reports handled', () => {
        setValue(PLAYER_TRACK_MENU, 'audio');
        tick();
        expect(closeTopmostOverlay()).toBe(true);
        tick();
        expect(get<TrackMenu>(PLAYER_TRACK_MENU)).toBe('none');
    });

    it('closes the track menu before the debug panel when both are open', () => {
        setValue(PLAYER_TRACK_MENU, 'subtitles');
        setValue(DEBUG_OPEN, true);
        tick();
        expect(closeTopmostOverlay()).toBe(true);
        tick();
        expect(get<TrackMenu>(PLAYER_TRACK_MENU)).toBe('none');
        expect(get<boolean>(DEBUG_OPEN)).toBe(true);
    });

    it('falls through to the debug panel once the track menu is closed', () => {
        setValue(DEBUG_OPEN, true);
        tick();
        expect(closeTopmostOverlay()).toBe(true);
        tick();
        expect(get<boolean>(DEBUG_OPEN)).toBe(false);
    });
});
