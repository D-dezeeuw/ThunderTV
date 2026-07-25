/**
 * Ambient module declaration for the `spektrum` bare specifier.
 *
 * Spektrum is resolved at runtime by the browser's import map (pinned CDN
 * URL in index.html, vendored fallback in public/vendor/ for packaged
 * targets) — it is never an npm dependency, so TypeScript has nothing to
 * resolve `import ... from 'spektrum'` against on its own. This file wraps
 * the real published type declarations (spektrum@1.1.0, verbatim from
 * https://unpkg.com/spektrum@1.1.0/spektrum.d.ts) in a `declare module`
 * block so every import site type-checks against the actual API.
 *
 * Keep this in lockstep with the pinned version in scripts/spektrum-version.json
 * — bump both together when the CDN pin changes.
 */
declare module 'spektrum' {
    export type State = Record<string, any>;

    export interface HistoryEntry {
        id: string;
        path: string;
        value: any;
        op: 'add' | 'set' | 'checkpoint';
    }

    /** A checkpoint entry as surfaced by `Spektrum.checkpoints` —
     *  a `HistoryEntry` augmented with its position in `history`. */
    export interface CheckpointView extends HistoryEntry {
        op: 'checkpoint';
        /** Index in `history` where this checkpoint sits. */
        index: number;
    }

    export interface Snapshot {
        /** History index after which this snapshot was captured. */
        index: number;
        /** Frozen copy of `appState` at that point. */
        state: State;
    }

    export interface ForkRecord {
        /** The dropped tail of history entries, in original order. */
        entries: HistoryEntry[];
        /** Cursor position the fork branched from. */
        forkedAt: number;
        /** Wall-clock timestamp (ms) when the fork was captured. */
        ts: number;
    }

    export type SystemFn = (state: State, delta: State) => void;

    /**
     * Closed enum of engine-attached error codes. User-thrown errors
     * from system functions pass through unchanged (no `code`). Engine-
     * originated errors carry one of these:
     *
     *  - `E_TICK_OVERFLOW`: tick fan-out exceeded 1024 iterations and
     *    the delta was discarded. Indicates a runaway feedback cycle
     *    between systems. Routed through `onError`.
     *  - `E_COMPUTED_SELF_DEP`: `computed(path, deps, fn)` was registered
     *    with a dep that overlaps its own output path (equal, ancestor, or
     *    descendant), which would feed its own delta and loop. Thrown
     *    synchronously from `computed()` at registration time — caught at
     *    your call site, not routed through `onError`.
     */
    export type EngineErrorCode = 'E_TICK_OVERFLOW' | 'E_COMPUTED_SELF_DEP';

    /**
     * Errors received by `onError`. Engine-originated errors carry a
     * `code` discriminator; system-thrown errors are passed through
     * with their original identity (no `code`).
     */
    export type ErrorHandler = (
        err: Error & { code?: EngineErrorCode },
        system: SystemFn | null,
    ) => void;

    export type RecordHandler = (entry: HistoryEntry) => void;

    export type ForkHandler = (fork: ForkRecord) => void;

    /**
     * Optional metadata attached to a `defineFn` registration. Surfaced
     * via `describe()` so callers see what each fn does and what
     * arguments it expects without reading the source.
     */
    export interface FnMeta {
        /** Human-readable description of what the fn does. */
        description?: string;
        /** Free-form input schema (typically JSON Schema). */
        input?: any;
        /** Free-form output schema (typically JSON Schema). */
        output?: any;
        /** Optional usage examples. */
        examples?: any[];
    }

    /** The manifest returned by `describe()`. */
    export interface SpektrumManifest {
        state: State;
        cursor: number;
        historyLength: number;
        forkCount: number;
        snapshotCount: number;
        options: SpektrumOptions;
        systems: Array<{ paths: string[]; name: string }>;
        fns: Array<{ name: string } & FnMeta>;
        refs: string[];
        /** intent name → number of bound elements carrying that intent */
        intents: Record<string, number>;
        checkpoints: CheckpointView[];
    }

    /** A history entry annotated with the systems whose subscriptions
     *  intersect its path (i.e. who would have fired). */
    export interface ExplainedEntry extends HistoryEntry {
        index: number;
        triggers: string[];
    }

    /** Handle returned by `attempt()`. The caller decides whether the
     *  speculative work survives (commit) or is rolled back (discard). */
    export interface AttemptHandle<T = any> {
        /** Whatever the attempt callback returned (often a Promise). */
        result: T;
        /** The `AbortSignal` passed to the attempt callback. `discard()`
         *  aborts it, so async speculative work wired to it is cancelled. */
        signal: AbortSignal;
        /** Mark the attempt as committed in history (records a checkpoint). */
        commit(): void;
        /** Replay back to before the attempt (aborting `signal`); the entries
         *  land on `forks` on the next mutation. */
        discard(): void;
    }

    /**
     * Per-iteration scope passed to handlers triggered inside a `data-each`.
     */
    export type IterationScope = Record<string, any>;

    export type BoundFn = (
        el: HTMLElement,
        state: State,
        delta: State,
        value: any,
        event?: Event,
        scope?: IterationScope,
    ) => void;

    export interface SpektrumOptions {
        /**
         * Cap `history.length`. When exceeded, oldest entries are dropped
         * (FIFO). With a limit set, replay() to indices below the surviving
         * window is undefined — don't set this if unlimited scrubback is needed.
         */
        historyLimit?: number;
        /**
         * Capture an `appState` snapshot every K recorded entries so
         * replay() costs O(K) instead of O(n).
         */
        snapshotEvery?: number;
        /**
         * Cap the number of preserved fork tails on `forks`. Defaults
         * to 50; oldest are evicted on overflow.
         */
        forkLimit?: number;
    }

    export interface Spektrum {
        /** Committed state. Direct mutation persists; setValue/trigger go through the delta. */
        readonly appState: State;
        /** Pending writes for the next tick. Cleared at the start of each pass. */
        readonly appStateDelta: State;
        /** Append-only log of recorded mutations. */
        readonly history: HistoryEntry[];
        /** Replay-acceleration snapshots. Populated only when `snapshotEvery` is set. */
        readonly snapshots: Snapshot[];
        /** Tails of history dropped by mutate-while-scrubbed-back, oldest first. */
        readonly forks: ForkRecord[];
        /** DOM handles registered via `data-ref="name"`. Keyed by the ref name. */
        readonly refs: Record<string, Element>;
        /** Semantic element registry populated from `data-intent="verb.noun"`. */
        readonly intents: Record<string, Element[]>;
        /** Index of the next history slot. Equals history.length unless scrubbed back via replay. */
        readonly cursor: number;
        /** True while replay() is in flight. */
        readonly replaying: boolean;
        /** Filtered view of `history`: every checkpoint entry with its history index appended. */
        readonly checkpoints: CheckpointView[];

        setValue(path: string, value: any, id?: string): void;
        addValue(path: string, value: number, id?: string): void;
        /** @deprecated Use {@link Spektrum.addValue}. */
        trigger(id: string, path: string, value: number): void;
        checkpoint(name: string, metadata?: any): void;
        computed(path: string, deps: string[], fn: (state: State) => any): () => void;
        addAsync<T = any>(path: string, fn: () => Promise<T>): () => Promise<void>;
        refresh(path: string): Promise<void> | undefined;

        addSystem(paths: string[], fn: SystemFn): () => void;
        watch(deps: string[], fn: SystemFn): () => void;
        removeSystem(fn: SystemFn): boolean;
        defineFn(name: string, fn: BoundFn, meta?: FnMeta): void;
        onError(fn: ErrorHandler): () => void;
        onError(fn: null): void;
        onRecord(fn: RecordHandler): () => void;
        onRecord(fn: null): void;
        onFork(fn: ForkHandler): () => void;
        onFork(fn: null): void;

        bindDOM(root?: Element | Document): () => void;
        /** rAF-driven tick pump. Reschedules itself every animation frame. */
        run(): void;
        /** Run one simulation step, draining the delta to quiescence. */
        tick(): void;

        replay(n: number): void;
        resetState(): void;
        reset(): void;

        serialize(opts?: { includeHistory?: boolean; includeForks?: boolean }): string;

        describe(): SpektrumManifest;
        explain(opts?: { from?: number; to?: number }): ExplainedEntry[];
        attempt<T = any>(name: string, fn: (signal: AbortSignal) => T): AttemptHandle<T>;
        findByIntent(name: string): Element[];
    }

    export function getPathObj<T = any>(obj: object, path: string): T | undefined;
    export function setPathValue(obj: object, path: string, value: any): void;
    export function precompile(source: string, fn: (state: State) => any): void;
    export function createSpektrum(opts?: SpektrumOptions): Spektrum;

    const _default: Spektrum;
    export default _default;

    export const appState: State;
    export const appStateDelta: State;
    export const history: HistoryEntry[];
    export const snapshots: Snapshot[];
    export const forks: ForkRecord[];
    export const refs: Record<string, Element>;
    export const intents: Record<string, Element[]>;
    export const setValue: Spektrum['setValue'];
    export const addValue: Spektrum['addValue'];
    /** @deprecated Use {@link addValue}. */
    export const trigger: Spektrum['trigger'];
    export const checkpoint: Spektrum['checkpoint'];
    export const computed: Spektrum['computed'];
    export const addAsync: Spektrum['addAsync'];
    export const refresh: Spektrum['refresh'];
    export const addSystem: Spektrum['addSystem'];
    export const watch: Spektrum['watch'];
    export const removeSystem: Spektrum['removeSystem'];
    export const defineFn: Spektrum['defineFn'];
    export const onError: Spektrum['onError'];
    export const onRecord: Spektrum['onRecord'];
    export const onFork: Spektrum['onFork'];
    export const bindDOM: Spektrum['bindDOM'];
    export const run: Spektrum['run'];
    export const tick: Spektrum['tick'];
    export const replay: Spektrum['replay'];
    export const reset: Spektrum['reset'];
    export const resetState: Spektrum['resetState'];
    export const serialize: Spektrum['serialize'];
    export const describe: Spektrum['describe'];
    export const explain: Spektrum['explain'];
    export const attempt: Spektrum['attempt'];
    export const findByIntent: Spektrum['findByIntent'];
}
