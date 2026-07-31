import { setValue } from 'spektrum';
import { PLAYLIST_SOURCES } from './playlist';
import type { PlaylistSourceSummary } from './playlist';
import { get } from './typed';

/**
 * The boot splash overlay (the wallpaper art shown while the first Live
 * load is still in flight). `'loading'` is the seeded default so the
 * overlay is already on screen at first paint — no flash of the bare shell
 * before it mounts; `'exiting'` drives the CSS fade-out
 * (`src/styles/boot-overlay.css`); `'done'` unmounts it (`data-if` in
 * `index.html`). Owned by `ui` alongside `ui.wizardOpen`/`ui.settingsOpen` —
 * same "transient, recomputed every boot" reasoning, never persisted.
 */
export const UI_BOOT_PHASE = 'ui.bootPhase';

export type BootPhase = 'loading' | 'exiting' | 'done';

export function initBootState(): void {
    setValue(UI_BOOT_PHASE, 'loading' satisfies BootPhase);
    channelDataReady = new Promise((resolve) => {
        resolveChannelDataReady = resolve;
    });
}

/**
 * Matches `boot-overlay.css`'s fade-out transition duration
 * (`var(--dur-3)`, 420ms) — kept as a plain constant rather than read from
 * the stylesheet since there's no live channel between the two; if one
 * changes, change the other.
 */
const EXIT_ANIMATION_MS = 420;

/** However fast a returning user's data comes back, the splash holds for at least this long — otherwise a warm cache makes it flash rather than read as a boot animation. */
const MIN_VISIBLE_MS = 500;

/**
 * Re-created by every `initBootState()` call (once per real boot — see
 * `bootstrap.ts` — and once per test's own setup), rather than a fixed
 * module-load-time singleton: that keeps `manageBootOverlay()`'s wait
 * scoped to *this* boot, and lets tests exercise more than one boot per
 * module instance without a stale already-resolved promise leaking in.
 */
let resolveChannelDataReady: (() => void) | null = null;
let channelDataReady: Promise<void> = new Promise((resolve) => {
    resolveChannelDataReady = resolve;
});

/**
 * Called once, by `src/ui/list-bindings.ts`'s initial `loadActiveSource()`
 * completion — the same "rows exist now" moment `consumeHandoff()` already
 * waits for. Safe to call more than once (a resolved promise ignores later
 * resolves); there is exactly one real boot per page life, so this never
 * actually happens outside tests.
 */
export function markChannelDataReady(): void {
    resolveChannelDataReady?.();
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Orchestrates the splash's lifetime. `sourcesLoaded` is
 * `bootstrap.ts`'s `sweepAndLoadPlaylistSources()` promise — once it
 * settles, `playlist.sources` reflects the real post-load state (and, if
 * empty, `openWizardIfNoSources()` has already opened the wizard as a side
 * effect of that same call). A configured install additionally waits for
 * `channelDataReady` — the Live list's first real paint — before exiting;
 * an unconfigured one has nothing to wait for, since there is no channel
 * data ever coming this boot until the wizard is used.
 *
 * `onExitComplete`, if given, runs once the fade-out animation finishes
 * (`bootstrap.ts` wires in `list.actions.ts`'s `preselectFirstLiveChannel`)
 * — deliberately a callback rather than a direct import: `list.actions.ts`
 * pulls in a large amount of catalog code that would otherwise ride along
 * into this module's *reachability* from `registry-keys.ts` (`ui.bootPhase`'s
 * `KEY_REGISTRY` entry, always eager) and defeat its code-splitting, even
 * though nothing here ever *calls* it before boot's own, already-eager path
 * does. Verified directly against a production build — see this commit's
 * message.
 */
export async function manageBootOverlay(sourcesLoaded: Promise<void>, onExitComplete?: () => void): Promise<void> {
    const readiness = sourcesLoaded.then(async () => {
        const sources = get<PlaylistSourceSummary[]>(PLAYLIST_SOURCES) ?? [];
        if (sources.length > 0) await channelDataReady;
    });

    await Promise.all([readiness, delay(MIN_VISIBLE_MS)]);
    beginBootExit(onExitComplete);
}

function beginBootExit(onExitComplete?: () => void): void {
    setValue(UI_BOOT_PHASE, 'exiting' satisfies BootPhase);
    setTimeout(() => {
        setValue(UI_BOOT_PHASE, 'done' satisfies BootPhase);
        onExitComplete?.();
    }, EXIT_ANIMATION_MS);
}
