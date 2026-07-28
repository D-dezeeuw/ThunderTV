import { defineFn } from 'spektrum';
import { GUIDE_SELECTED_KEY } from './guide';
import { set } from './typed';

/** Program-block selection (Guide view) — mirrors `recent.actions.ts`'s `recent/play` pattern: one delegated click handler on the row container, reading the target's own data attribute rather than binding per-block. */
export function registerGuideActions(): void {
    defineFn('guide/selectProgram', (el, _state, _delta, _value, event) => {
        const target = (event?.target as HTMLElement | undefined)?.closest<HTMLElement>('[data-program-key]') ?? el;
        const key = target.dataset['programKey'];
        if (key !== undefined) set(GUIDE_SELECTED_KEY, key);
    });
}
