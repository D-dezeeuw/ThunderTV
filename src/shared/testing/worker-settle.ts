/**
 * One definition of the `@vitest/web-worker` settle delay, shared by the two
 * specs that tear a parser worker down mid-flight
 * (`m3u/parser-client.spec.ts` and `m3u/import-run.spec.ts`).
 *
 * The harness backs every `new Worker()` for the same module URL with a
 * single shared, invalidate-after-import module cache; a real browser gives
 * each worker its own module graph. Calling `cancel()` — which synchronously
 * spins up a replacement worker for that same module — before the first
 * worker's import has invalidated the cache entry races two concurrent
 * imports of one slot, and the loser never gets its `self.onmessage` wired
 * up. This works around the harness, never a production race.
 *
 * Previously both specs carried their own hand-tuned literal (10 ms in one,
 * 10 ms and 50 ms in the other). Those held in isolation and lost under
 * full-suite load, where other spec files' real workers contend for the same
 * cache — the ~23% flake AUDIT.md §4.3 measured. The margin here is
 * deliberately far larger than the race window rather than tuned close to
 * it: this runs a handful of times in the whole suite, so seconds of total
 * headroom cost nothing next to a red run that trains everyone to re-run.
 */
const WORKER_MODULE_CACHE_SETTLE_MS = 250;

export function settleWorkerModuleCache(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, WORKER_MODULE_CACHE_SETTLE_MS));
}
