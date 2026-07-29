import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRadioVisualizerPresets } from './presets/index';

/**
 * `index.html`'s `#radio-visualizer-select` (Radio's preset picker) hardcodes
 * one `<option value="...">` per preset id, matching `createRadioVisualizerPresets()`.
 * There's no shared source of truth between the TS preset list and the
 * static markup — this guards against the two silently drifting apart (a
 * renamed/added/removed preset id that the picker doesn't offer, or an
 * option value that doesn't match any real preset).
 */
describe('Radio visualizer picker markup matches the real preset list', () => {
    const repoRoot = fileURLToPath(new NodeURL('../../..', import.meta.url));
    const indexHtml = readFileSync(`${repoRoot}/index.html`, 'utf8');
    const presetIds = createRadioVisualizerPresets().map((p) => p.id);

    it('has an <option> for every preset id', () => {
        for (const id of presetIds) {
            expect(indexHtml).toContain(`<option value="${id}"`);
        }
    });

    it('offers the "auto" option alongside the presets', () => {
        expect(indexHtml).toContain('<option value="auto"');
    });
});
