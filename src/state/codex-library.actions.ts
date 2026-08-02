import { defineFn } from 'spektrum';

/**
 * Shared Codexes (stone 10) — the boot-path half.
 *
 * The Settings → Codexes surface is unreachable until Settings is opened,
 * and everything it needs (subscription storage, signature verification, the
 * blocklist, the whole `src/codex/` graph) lives in `codex-library.run.ts`.
 * Same shim shape as `subtitle-search.actions.ts`, same reason: the eager
 * budget in `check-dist.mjs` bounds what a Chromium 87 TV parses before it
 * paints anything.
 *
 * The five `defineFn` names stay here so `check-reachability.mjs` can see
 * them, and so a press works whether or not the chunk has loaded yet.
 */
export function registerCodexLibraryActions(): void {
    defineFn('codexLibrary/add', () => {
        void import('./codex-library.run').then((module) => {
            module.addFromInput();
        });
    });

    defineFn('codexLibrary/remove', (element) => {
        const url = element.dataset['id'];
        if (!url) return;
        void import('./codex-library.run').then((module) => {
            module.removeByUrl(url);
        });
    });

    defineFn('codexLibrary/refresh', () => {
        void import('./codex-library.run').then((module) => {
            module.refreshAll();
        });
    });

    defineFn('codexLibrary/block', (element) => {
        const authorId = element.dataset['id'] ?? null;
        void import('./codex-library.run').then((module) => {
            module.setAuthorTrust(authorId, false);
        });
    });

    defineFn('codexLibrary/unblock', (element) => {
        const authorId = element.dataset['id'] ?? null;
        void import('./codex-library.run').then((module) => {
            module.setAuthorTrust(authorId, true);
        });
    });
}

/**
 * Refreshes subscriptions on boot, honouring the TTL — a reload inside the
 * window makes no upstream requests at all.
 *
 * A `supervise()` task (`src/app/bootstrap.ts`), so the import lands after
 * first paint. A device with no subscriptions still pays one chunk fetch
 * here; what it no longer pays is the parse cost, before anything renders.
 */
export async function refreshCodexLibraryOnBoot(): Promise<void> {
    const module = await import('./codex-library.run');
    await module.refreshCodexLibraryOnBoot();
}
