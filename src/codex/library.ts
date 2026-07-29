import { getPlatform } from '../core/platform';
import { primeHealthCache } from '../health/store';
import { applyDocument, readCodex, type CodexImportProblem } from './apply';
import { blockedAuthors } from './blocklist';
import type { CodexDocument } from './format';
import { commitKnowledge, localKnowledge, type CommitCounts } from './knowledge';
import { mergeKnowledge } from './merge';
import { trustedKnowledge } from './trust';

/**
 * The community Codex — stone 10's four verbs, with nothing to operate.
 *
 * **Publish** is deliberately not code. A Codex is already a plain signed
 * JSON file; publishing it means putting it somewhere with a URL — a gist, a
 * pinned file, a shared folder, a static host. Building an upload path would
 * mean building the thing the whole pillar exists to avoid, and would fail
 * the vision's disappearance test on the day we stopped paying for it.
 *
 * **Discover** is a list of URLs the user chose. That is the entire
 * mechanism, and it is recursive in the useful way: a list of good Codexes
 * is itself just a file someone can publish and hand around.
 *
 * **Merge** is `merge.ts` bounded by `trust.ts`.
 *
 * **Prune** is the one with a real requirement attached. "A bad contributor
 * can be pruned retroactively without unpicking the rest" is only possible
 * if the raw documents are still here — a `max`-joined weight cannot be run
 * backwards. So every subscription retains the verified document it fetched,
 * and pruning re-merges the survivors from scratch onto this device's own
 * evidence. That is exact, and it works only because the join is
 * associative.
 *
 * Politeness matches `src/epg/feed-fetch.ts`, for the same reason: these are
 * other people's servers, usually someone's free static host. Conditional on
 * ETag, TTL-gated, sequential with fixed spacing, never parallel.
 */

const SUBSCRIPTIONS_KEY = 'codex.library.subscriptions';
const DOCUMENT_PREFIX = 'codex.library.doc.';

/** Codexes are hand-published and change rarely; a day is polite and still fresh enough to be useful. */
export const SUBSCRIPTION_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_SPACING_MS = 300;
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Retained documents are the price of exact pruning, so the count is
 * bounded rather than open — a device on the localStorage tier has a few
 * megabytes in total, and a large community Codex is not small.
 */
export const MAX_SUBSCRIPTIONS = 16;

export type SubscriptionProblem = CodexImportProblem | 'unreachable' | 'too-many';

export interface Subscription {
    url: string;
    addedAt: number;
    lastFetchedAt: number;
    etag: string | null;
    /** Fingerprint of whoever signed the retained document, once one has been fetched successfully. */
    authorId: string | null;
    /** Countries the retained document makes claims about — kept so removing it can still rebuild those mappings. */
    countries: string[];
    identityClaims: number;
    healthClaims: number;
    /** Why the last fetch attempt did not land, or `null` when it did. Nullable rather than optional so a recovery genuinely clears it. */
    lastProblem: SubscriptionProblem | null;
}

export type FetchOutcome = 'fetched' | 'not-modified' | 'skipped-fresh' | 'failed';

export interface RefreshSummary {
    results: { url: string; outcome: FetchOutcome; problem: SubscriptionProblem | null }[];
    counts: CommitCounts;
}

function documentKey(url: string): string {
    return `${DOCUMENT_PREFIX}${url}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listSubscriptions(): Promise<Subscription[]> {
    const stored = await getPlatform().storage.get<Subscription[]>(SUBSCRIPTIONS_KEY);
    return Array.isArray(stored) ? stored : [];
}

async function writeSubscriptions(subscriptions: readonly Subscription[]): Promise<void> {
    await getPlatform().storage.set(SUBSCRIPTIONS_KEY, [...subscriptions]);
}

async function retainedDocuments(subscriptions: readonly Subscription[]): Promise<CodexDocument[]> {
    const storage = getPlatform().storage;
    const documents: CodexDocument[] = [];
    for (const subscription of subscriptions) {
        const stored = await storage.get<CodexDocument>(documentKey(subscription.url));
        if (stored) documents.push(stored);
    }
    return documents;
}

/** Describes a fetched document the way the subscription list shows it. */
function describe(document: CodexDocument): Pick<Subscription, 'authorId' | 'countries' | 'identityClaims' | 'healthClaims'> {
    return {
        authorId: document.body.author.id,
        countries: [...new Set(document.body.identity.map((claim) => claim.country))],
        identityClaims: document.body.identity.length,
        healthClaims: document.body.health.length,
    };
}

export interface AddResult {
    ok: boolean;
    problem: SubscriptionProblem | null;
    authorId: string | null;
}

/**
 * Subscribes to a Codex URL and applies it immediately — a subscription the
 * user cannot see the effect of is indistinguishable from one that silently
 * failed.
 */
export async function addSubscription(url: string): Promise<AddResult> {
    const subscriptions = await listSubscriptions();
    if (subscriptions.some((entry) => entry.url === url)) return { ok: true, problem: null, authorId: null };
    if (subscriptions.length >= MAX_SUBSCRIPTIONS) return { ok: false, problem: 'too-many', authorId: null };

    const fetched = await fetchDocument(url, null);
    if (fetched.outcome !== 'fetched' || !fetched.document) {
        return { ok: false, problem: fetched.problem ?? 'unreachable', authorId: null };
    }

    const now = Date.now();
    await getPlatform().storage.set(documentKey(url), fetched.document);
    await writeSubscriptions([
        ...subscriptions,
        { url, addedAt: now, lastFetchedAt: now, etag: fetched.etag, lastProblem: null, ...describe(fetched.document) },
    ]);

    const applied = await applyDocument(fetched.document);
    return { ok: true, problem: null, authorId: applied.authorId ?? null };
}

/** Unsubscribes and rebuilds, so the removed Codex's contribution actually goes away rather than lingering in a `max`. */
export async function removeSubscription(url: string): Promise<CommitCounts> {
    const subscriptions = await listSubscriptions();
    const removed = subscriptions.find((entry) => entry.url === url);
    await getPlatform().storage.delete(documentKey(url));
    await writeSubscriptions(subscriptions.filter((entry) => entry.url !== url));
    return rebuildFromLibrary(removed?.countries ?? []);
}

interface FetchedDocument {
    outcome: FetchOutcome;
    document: CodexDocument | null;
    etag: string | null;
    problem: SubscriptionProblem | null;
}

async function fetchDocument(url: string, etag: string | null): Promise<FetchedDocument> {
    const headers: Record<string, string> = {};
    if (etag) headers['If-None-Match'] = etag;

    const result = await getPlatform().http.get(url, { headers, timeoutMs: FETCH_TIMEOUT_MS });
    if (result.kind === 'http' && result.status === 304) return { outcome: 'not-modified', document: null, etag, problem: null };
    if (result.kind !== 'ok') return { outcome: 'failed', document: null, etag, problem: 'unreachable' };

    let text: string;
    try {
        text = await result.res.text();
    } catch {
        return { outcome: 'failed', document: null, etag, problem: 'unreachable' };
    }

    const read = await readCodex(text);
    if ('problem' in read) return { outcome: 'failed', document: null, etag, problem: read.problem };
    return { outcome: 'fetched', document: read.document, etag: result.etag, problem: null };
}

/**
 * Re-fetches every subscription, then rebuilds. `force` bypasses the TTL —
 * wired to the manual refresh button, because a user who just published a
 * correction should not have to wait a day to see it.
 */
export async function refreshSubscriptions(options: { force?: boolean } = {}): Promise<RefreshSummary> {
    const storage = getPlatform().storage;
    const subscriptions = await listSubscriptions();
    const now = Date.now();
    const results: RefreshSummary['results'] = [];
    const next: Subscription[] = [];
    let changed = false;

    for (let i = 0; i < subscriptions.length; i++) {
        const subscription = subscriptions[i]!;
        if (!options.force && now - subscription.lastFetchedAt < SUBSCRIPTION_TTL_MS) {
            next.push(subscription);
            results.push({ url: subscription.url, outcome: 'skipped-fresh', problem: null });
            continue;
        }
        if (results.length > 0) await sleep(REQUEST_SPACING_MS);

        const fetched = await fetchDocument(subscription.url, subscription.etag);
        results.push({ url: subscription.url, outcome: fetched.outcome, problem: fetched.problem });

        if (fetched.outcome === 'fetched' && fetched.document) {
            changed = true;
            await storage.set(documentKey(subscription.url), fetched.document);
            next.push({ ...subscription, lastFetchedAt: now, etag: fetched.etag, lastProblem: null, ...describe(fetched.document) });
        } else {
            // `lastFetchedAt` advances even on failure, exactly as the EPG
            // feeds do: without it a dead URL is retried on every reload
            // instead of backing off until the next window.
            next.push({ ...subscription, lastFetchedAt: now, lastProblem: fetched.problem });
        }
    }

    await writeSubscriptions(next);
    const counts = changed ? await rebuildFromLibrary() : { identityApplied: 0, healthApplied: 0 };
    return { results, counts };
}

/**
 * Recomputes local knowledge from this device's own evidence plus every
 * retained, unblocked Codex.
 *
 * This is the exact answer, not a repair: starting from `'own-only'` and
 * re-folding the survivors reproduces the state this device would have had
 * if the pruned author's file had never existed. It is correct *because*
 * `mergeKnowledge` is associative — the order the library happens to be
 * stored in cannot change where it lands.
 */
export async function rebuildFromLibrary(extraCountries: readonly string[] = []): Promise<CommitCounts> {
    const subscriptions = await listSubscriptions();
    const documents = await retainedDocuments(subscriptions);
    const blocked = await blockedAuthors();
    const nowMs = Date.now();

    const countries = [...new Set([...extraCountries, ...subscriptions.flatMap((entry) => entry.countries)])];
    const base = await localKnowledge(countries, 'own-only');

    let merged = base;
    let savedAt = 0;
    for (const document of documents) {
        merged = mergeKnowledge(merged, trustedKnowledge(document.body, { blocked, nowMs }));
        savedAt = Math.max(savedAt, document.body.generatedAt);
    }

    const counts = await commitKnowledge(merged, countries, savedAt);
    await primeHealthCache();
    return counts;
}
