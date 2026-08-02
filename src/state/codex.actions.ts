import { defineFn } from 'spektrum';

/**
 * Codex export/import — the boot-path half.
 *
 * Everything that signs, hashes, reads a file or touches the country
 * registry lives in `codex.run.ts` and is imported when one of these two
 * buttons is pressed. `subtitle-search.actions.ts` is the worked example of
 * this shape; the reason is the same one `check-dist.mjs`'s eager budget
 * exists for, and here it is worth ~4 KiB gzip of a webOS TV's first paint.
 *
 * `registerCodexActions()` still runs at boot, so `check-reachability.mjs`
 * sees both `defineFn` names and the Settings buttons stay live.
 */
export function registerCodexActions(): void {
    defineFn('codex/export', () => {
        void import('./codex.run').then((module) => module.exportCodex());
    });
    defineFn('codex/import', () => {
        void import('./codex.run').then((module) => module.importCodexFromFile());
    });
}

/**
 * Publishes this device's author fingerprint for the Settings readout.
 *
 * A `supervise()` boot task (`src/app/bootstrap.ts`), so the dynamic import
 * happens after first paint and costs nothing a viewer can see — what it
 * buys is that WebCrypto identity handling, `src/codex/` and the country
 * table are not in the chunk the TV parses before rendering.
 */
export async function publishCodexAuthorId(): Promise<void> {
    const module = await import('./codex.run');
    await module.publishCodexAuthorId();
}
