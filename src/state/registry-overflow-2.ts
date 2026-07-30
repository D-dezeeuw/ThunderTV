import { UI_BOOT_PHASE } from './boot';
import type { KeyMeta } from './registry';

/**
 * `registry-overflow.ts` itself is now sitting on the 400-line ceiling too
 * — same reasoning as that file's own header comment (which explains why
 * `registry-keys.ts` stopped taking new entries in the first place), one
 * level deeper. `KEY_REGISTRY` spreads this in alongside
 * `OVERFLOW_REGISTRY_ENTRIES`; nothing downstream cares which overflow file
 * a given key actually lives in.
 */
export const OVERFLOW_REGISTRY_ENTRIES_2: Record<string, KeyMeta> = {
    // --- ui: boot splash ---
    [UI_BOOT_PHASE]: {
        owner: 'ui',
        persisted: false,
        description: '\'loading\'|\'exiting\'|\'done\' — the boot.ts wallpaper splash; always starts at \'loading\', recomputed fresh every boot.',
    },
};
