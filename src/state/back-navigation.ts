import { setValue } from 'spektrum';
import { DEBUG_OPEN } from './debug';
import { SERIES_DETAIL_ID } from './series';
import { get } from './typed';
import { UI_SETTINGS_OPEN } from './ui';
import { VOD_DETAIL_ID } from './vod';
import { UI_WIZARD_OPEN } from './wizard';

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
    if (get<boolean>(DEBUG_OPEN) === true) {
        setValue(DEBUG_OPEN, false);
        return true;
    }
    if (get<boolean>(UI_SETTINGS_OPEN) === true) {
        setValue(UI_SETTINGS_OPEN, false);
        return true;
    }
    if (get<boolean>(UI_WIZARD_OPEN) === true) {
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
