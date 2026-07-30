import { UI_LIST_LAYOUT } from './list-layout';
import { UI_FONT_SIZE, UI_THEME } from './ui';
import type { KeyMeta } from './registry';

/**
 * The `ui`-owned presentation preferences — theme, text size, and the
 * list/grid switch. Split out of `registry-overflow.ts` for the same reason
 * that file was split out of `registry-keys.ts`: both had reached ESLint's
 * 400-line hard ceiling with no slack left, and every new key needs
 * somewhere to go. Merged into `OVERFLOW_REGISTRY_ENTRIES` via one spread,
 * exactly like `registry-epg.ts`, so `KEY_REGISTRY` stays the one object
 * every consumer reads.
 */
export const UI_REGISTRY_ENTRIES: Record<string, KeyMeta> = {
    [UI_THEME]: {
        owner: 'ui',
        persisted: true,
        description:
            "auto/dark/light — Settings → Appearance theme preference; 'auto' resolves via prefers-color-scheme at apply time (src/state/theme.ts) and an explicit choice always wins. Applied imperatively to <html data-theme>, never via a binding, so the boot pre-paint and the matchMedia re-resolve share one mechanism.",
    },
    [UI_FONT_SIZE]: {
        owner: 'ui',
        persisted: true,
        description:
            "Text size step (small/default/large/xlarge) — Settings → Appearance. Retargets only tokens.css's --text-* via <html data-font-size>; row geometry never moves (that stays ui.density's alone, src/ui/density.ts).",
    },
    [UI_LIST_LAYOUT]: {
        owner: 'ui',
        persisted: true,
        description:
            'Per-view list/grid choice for the shared virtual list, keyed by the three views that offer the toggle (live/movies/series). Persisted because it is a browsing preference, not session state; a scope missing from the stored value falls back to the list layout (src/state/list-layout.ts).',
    },
};
