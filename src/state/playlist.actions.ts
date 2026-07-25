/**
 * TODO(phase-07): temporary proof-of-adapter wiring for Feature 03.7.10,
 * migrated here from `src/app/first-run-file-picker.ts` as part of the
 * Phase 05 action-layer migration. Phase 07 replaces this with the real
 * M3U file import flow (parsing, worker handoff, source creation) — this
 * only proves `WebFileAdapter.pickFile()` end-to-end against a real user
 * gesture and renders the resulting file's name/size.
 */
import { defineFn, setValue } from 'spektrum';
import { strings } from '../app/strings';
import { getPlatform } from '../core/platform';
import { M3U_ACCEPT } from '../core/platform/web-file-adapter';
import { PLAYLIST_LAST_PICKED_LABEL } from './playlist';

export function registerPlaylistActions(): void {
    defineFn('playlist/pickM3uFile', () => {
        void pickAndRenderM3uFile();
    });
}

async function pickAndRenderM3uFile(): Promise<void> {
    const picked = await getPlatform().files.pickFile(M3U_ACCEPT);
    if (!picked) {
        setValue(PLAYLIST_LAST_PICKED_LABEL, null);
        return;
    }
    setValue(
        PLAYLIST_LAST_PICKED_LABEL,
        strings.emptyStates.firstRun.pickedFileTemplate
            .replace('{name}', picked.name)
            .replace('{size}', String(picked.size)),
    );
}
