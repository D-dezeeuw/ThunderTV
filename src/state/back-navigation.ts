import { setValue } from 'spektrum';
import { DEBUG_OPEN } from './debug';
import { PLAYER_TRACK_MENU, type TrackMenu } from './player-tracks';
import { SERIES_DETAIL_ID } from './series';
import { get } from './typed';
import { UI_SETTINGS_OPEN } from './ui';
import { VOD_DETAIL_ID } from './vod';
import { UI_WIZARD_EDIT_SOURCE_ID, UI_WIZARD_OPEN } from './wizard';

/**
 * What the remote's Back button (and a browser Backspace on a TV build)
 * should do — Phase 35, stone 8.
 *
 * A TV remote has no Escape key and often no pointer, so Back is frequently
 * the *only* way out of an overlay. It therefore unwinds them one at a
 * time, innermost first, in the order a viewer would expect to have opened
 * them — closing everything at once would lose the settings panel a user
 * only opened the debug view from.
 *
 * Returns `false` when nothing was open, so the caller can let the platform
 * handle it (webOS exits the app, a browser goes back in history). Silently
 * swallowing Back would trap the user in the app with no way out, which is
 * a webOS certification failure as well as bad manners.
 */
export function closeTopmostOverlay(): boolean {
    // The audio/subtitle/visualizer dock menu is the most transient overlay
    // — a popover tied directly to a still-visible player control — so it
    // unwinds before the app-level panels below. Its own local keydown
    // handler (player-tracks.actions.ts) only reacts to a literal Escape
    // key, which no TV remote sends; this is what actually makes Back close
    // it on webOS/Tizen hardware.
    const trackMenu = get<TrackMenu>(PLAYER_TRACK_MENU);
    if (trackMenu !== undefined && trackMenu !== 'none') {
        setValue(PLAYER_TRACK_MENU, 'none');
        return true;
    }
    if (get<boolean>(DEBUG_OPEN) === true) {
        setValue(DEBUG_OPEN, false);
        return true;
    }
    if (get<boolean>(UI_SETTINGS_OPEN) === true) {
        setValue(UI_SETTINGS_OPEN, false);
        return true;
    }
    if (get<boolean>(UI_WIZARD_OPEN) === true) {
        // Discards an in-progress source edit along with the modal — the
        // fields are uncontrolled, so nothing was written anywhere yet.
        setValue(UI_WIZARD_EDIT_SOURCE_ID, null);
        setValue(UI_WIZARD_OPEN, false);
        return true;
    }
    // The catalog detail panels are overlays over the list, so they unwind
    // before the view itself does.
    if (get<string | null>(VOD_DETAIL_ID)) {
        setValue(VOD_DETAIL_ID, null);
        return true;
    }
    if (get<string | null>(SERIES_DETAIL_ID)) {
        setValue(SERIES_DETAIL_ID, null);
        return true;
    }
    return false;
}
