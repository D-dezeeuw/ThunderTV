import { describe, expect, it } from 'vitest';
import { isPictureClick } from './tap-to-pause';

/**
 * The whole point of the geometry check: a `<video>` with native `controls`
 * retargets clicks on its own control bar to the host element, so a
 * listener that fired on every click would toggle playback on top of the
 * browser's handling — two toggles, no visible change.
 */
const rect = { top: 100, bottom: 400 }; // 300px tall

describe('isPictureClick()', () => {
    it('treats a click in the body of the picture as a pause gesture', () => {
        expect(isPictureClick(rect, 150)).toBe(true);
        expect(isPictureClick(rect, 300)).toBe(true);
    });

    it('leaves the bottom strip to the native controls', () => {
        expect(isPictureClick(rect, 399)).toBe(false);
        expect(isPictureClick(rect, 360)).toBe(false);
    });

    it('ignores a pane too short to separate picture from controls', () => {
        expect(isPictureClick({ top: 0, bottom: 40 }, 10)).toBe(false);
    });
});
