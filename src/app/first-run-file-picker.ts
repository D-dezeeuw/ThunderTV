/**
 * TODO(phase-07): temporary proof-of-adapter wiring for Feature 03.7.10.
 * Phase 07 replaces this with the real M3U file import flow (parsing,
 * worker handoff, source creation) — this only proves `WebFileAdapter`'s
 * `pickFile()` end-to-end against a real user gesture and renders the
 * resulting file's name/size. Nothing is imported or parsed.
 */
import { defineFn, setValue } from 'spektrum';
import { getPlatform } from '../core/platform';
import { M3U_ACCEPT } from '../core/platform/web-file-adapter';
import { strings } from './strings';

export function registerFirstRunFilePickerAction(): void {
    defineFn('pickM3uFile', () => {
        void pickAndRenderM3uFile();
    });
}

async function pickAndRenderM3uFile(): Promise<void> {
    const picked = await getPlatform().files.pickFile(M3U_ACCEPT);
    if (!picked) {
        setValue('sources.lastPickedLabel', null);
        return;
    }
    setValue(
        'sources.lastPickedLabel',
        strings.emptyStates.firstRun.pickedFileTemplate
            .replace('{name}', picked.name)
            .replace('{size}', String(picked.size)),
    );
}
