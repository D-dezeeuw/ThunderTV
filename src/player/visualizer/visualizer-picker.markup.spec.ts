import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VISUALIZER_PICKER_OPTIONS } from '../../state/player.selectors';
import { createRadioVisualizerPresets } from './presets/index';

/**
 * Radio's preset picker (`index.html`'s `#radio-visualizer-btn` menu) renders
 * one row per `VISUALIZER_PICKER_OPTIONS` entry, and the visualizer resolves
 * whatever id the picked row carries against `createRadioVisualizerPresets()`.
 * Nothing links the two lists at compile time, so this guards the drift: a
 * renamed or added preset the picker doesn't offer, or a picker row pointing
 * at a preset that no longer exists (which would silently pin nothing).
 *
 * Was a markup-scraping test against the old `<select>`'s `<option value>`s;
 * the picker is a `data-each` now, so the invariant is checked where it
 * actually lives.
 */
describe('Radio visualizer picker options match the real preset list', () => {
    const presetIds = createRadioVisualizerPresets().map((preset) => preset.id);
    const pickerIds = VISUALIZER_PICKER_OPTIONS.map((option) => option.id);

    it('offers every preset id, plus the "auto" sentinel', () => {
        expect(pickerIds).toContain('auto');
        for (const id of presetIds) expect(pickerIds).toContain(id);
    });

    it('offers nothing that is not a real preset', () => {
        for (const id of pickerIds) {
            if (id === 'auto') continue;
            expect(presetIds).toContain(id);
        }
    });

    it('names every row, and opens each group exactly once', () => {
        for (const option of VISUALIZER_PICKER_OPTIONS) expect(option.labelKey).not.toBe('');
        const groups = VISUALIZER_PICKER_OPTIONS.map((option) => option.groupKey).filter(Boolean);
        expect(new Set(groups).size).toBe(groups.length);
    });

    /**
     * The picker must stay an in-page menu. A native `<select>` here is the
     * webOS/LG-simulator bug it was converted away from: the dropdown opens
     * as a browser-level widget the remote's (page-injected) keys never
     * reach, so it can't be dismissed and every further OK press
     * re-triggers the `<select>` underneath — an endless self-reactivating
     * dropdown. See `src/ui/spatial/README.md`.
     */
    it('is rendered as an in-page menu in index.html, never a native <select>', () => {
        const repoRoot = fileURLToPath(new NodeURL('../../..', import.meta.url));
        const indexHtml = readFileSync(`${repoRoot}/index.html`, 'utf8');
        expect(indexHtml).toContain('data-fn="player/toggleVisualizerMenu"');
        expect(indexHtml).toContain('data-each="visualizerPresetOptions"');
        expect(indexHtml).not.toMatch(/<select[^>]*\bvisualizer/i);
    });
});
