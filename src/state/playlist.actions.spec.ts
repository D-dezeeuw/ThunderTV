import { appState, bindDOM, getPathObj, resetState, tick } from 'spektrum';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withFakePlatform } from '../core/platform/fake-platform';
import { registerPlaylistActions } from './playlist.actions';
import { PLAYLIST_LAST_PICKED_LABEL } from './playlist';

function lastPickedLabel(): string | null | undefined {
    return getPathObj<string | null>(appState, PLAYLIST_LAST_PICKED_LABEL);
}

/**
 * Migrated from the Phase 03 `first-run-file-picker.ts` module, renamed to
 * `playlist/pickM3uFile` (Feature 05.2.3) — same TODO(phase-07)
 * proof-of-adapter-wiring behavior.
 */
describe('playlist/pickM3uFile action', () => {
    beforeAll(() => {
        registerPlaylistActions();
    });

    afterEach(() => {
        resetState();
    });

    it('renders the picked file name/size once WebFileAdapter.pickFile() resolves', async () => {
        await withFakePlatform({}, async ({ files }) => {
            files.seed({ name: 'playlist.m3u', size: 1234, file: new File([], 'playlist.m3u') });

            const btn = document.createElement('button');
            btn.setAttribute('data-action', 'click');
            btn.setAttribute('data-fn', 'playlist/pickM3uFile');
            document.body.appendChild(btn);
            const destroy = bindDOM(document.body);

            btn.click();
            tick();
            await Promise.resolve();
            await Promise.resolve();
            tick();

            expect(lastPickedLabel()).toContain('playlist.m3u');
            expect(lastPickedLabel()).toContain('1234');

            destroy();
            btn.remove();
        });
    });

    it('sets the label to null when the user cancels the picker', async () => {
        await withFakePlatform({}, async () => {
            const btn = document.createElement('button');
            btn.setAttribute('data-action', 'click');
            btn.setAttribute('data-fn', 'playlist/pickM3uFile');
            document.body.appendChild(btn);
            const destroy = bindDOM(document.body);

            btn.click();
            tick();
            await Promise.resolve();
            await Promise.resolve();
            tick();

            expect(lastPickedLabel()).toBeNull();

            destroy();
            btn.remove();
        });
    });
});
