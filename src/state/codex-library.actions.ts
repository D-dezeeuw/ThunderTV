import { defineFn, refs } from 'spektrum';
import { strings } from '../app/strings';
import { blockAuthor, blockedAuthors, unblockAuthor } from '../codex/blocklist';
import {
    addSubscription,
    listSubscriptions,
    rebuildFromLibrary,
    refreshSubscriptions,
    removeSubscription,
    type SubscriptionProblem,
} from '../codex/library';
import { publishHealthCounts } from './health.actions';
import {
    CODEX_BLOCKED_ROWS,
    CODEX_LIBRARY_MESSAGE,
    CODEX_LIBRARY_ROWS,
    CODEX_LIBRARY_STATE,
    type CodexBlockedRow,
    type CodexLibraryRow,
    type CodexLibraryUiState,
} from './codex-library';
import { refreshLiveRows } from './live.actions';
import { set } from './typed';

/**
 * The Settings surface for shared Codexes (stone 10).
 *
 * Every action ends the same way — republish the list, then rebuild the
 * channel rows — because all four of them (follow, unfollow, stop trusting,
 * trust again) can change which channels are shown and how they rank. An
 * action whose effect the user cannot see is indistinguishable from one that
 * silently failed, which is the specific way trust UIs go wrong.
 */

function report(state: CodexLibraryUiState, message: string): void {
    set(CODEX_LIBRARY_STATE, state);
    set(CODEX_LIBRARY_MESSAGE, message);
}

const PROBLEM_MESSAGES: Record<SubscriptionProblem, () => string> = {
    'not-json': () => strings.codex.notJson,
    'not-a-codex': () => strings.codex.notACodex,
    'bad-signature': () => strings.codex.badSignature,
    'blocked-author': () => strings.codex.library.blockedAuthorProblem,
    unreachable: () => strings.codex.library.unreachable,
    'too-many': () => strings.codex.library.tooMany,
};

export async function publishCodexLibrary(): Promise<void> {
    const [subscriptions, blocked] = await Promise.all([listSubscriptions(), blockedAuthors()]);

    set(
        CODEX_LIBRARY_ROWS,
        subscriptions.map(
            (entry): CodexLibraryRow => ({
                url: entry.url,
                authorId: entry.authorId ?? '',
                counts: `${String(entry.identityClaims)} · ${String(entry.healthClaims)}`,
                problem: entry.lastProblem ? PROBLEM_MESSAGES[entry.lastProblem]() : '',
                blocked: entry.authorId !== null && blocked.has(entry.authorId),
            }),
        ),
    );
    set(CODEX_BLOCKED_ROWS, [...blocked].map((authorId): CodexBlockedRow => ({ authorId })));
}

/** Everything that has to happen after knowledge changed, in the one place, so no action can forget half of it. */
async function afterKnowledgeChanged(): Promise<void> {
    await publishCodexLibrary();
    publishHealthCounts();
    refreshLiveRows();
}

/**
 * `Error.message` carries the user-facing reason, so there is exactly one
 * place in this module that sets the `'failed'` state — an action cannot
 * report success and failure in two different shapes by accident.
 */
async function run(action: () => Promise<string>): Promise<void> {
    report('busy', '');
    try {
        const message = await action();
        await afterKnowledgeChanged();
        report('done', message);
    } catch (error) {
        const reason = error instanceof Error && error.message ? error.message : strings.codex.library.unreachable;
        report('failed', reason);
    }
}

/** Uncontrolled input read on submit, matching `playlist.actions.ts` — a half-typed URL is not state worth making reactive. */
function urlInputValue(): string {
    const element = refs['codexLibraryUrlInput'];
    return element instanceof HTMLInputElement ? element.value.trim() : '';
}

export function registerCodexLibraryActions(): void {
    defineFn('codexLibrary/add', () => {
        void run(async () => {
            const url = urlInputValue();
            if (!url) return '';
            const result = await addSubscription(url);
            if (!result.ok) throw new Error(PROBLEM_MESSAGES[result.problem ?? 'unreachable']());
            const input = refs['codexLibraryUrlInput'];
            if (input instanceof HTMLInputElement) input.value = '';
            return strings.codex.library.added;
        });
    });

    defineFn('codexLibrary/remove', (element) => {
        const url = element.dataset['id'];
        if (!url) return;
        void run(async () => countsMessage(await removeSubscription(url)));
    });

    defineFn('codexLibrary/refresh', () => {
        void run(async () => {
            const summary = await refreshSubscriptions({ force: true });
            return countsMessage(summary.counts);
        });
    });

    defineFn('codexLibrary/block', (element) => {
        void setTrust(element.dataset['id'] ?? null, false);
    });

    defineFn('codexLibrary/unblock', (element) => {
        void setTrust(element.dataset['id'] ?? null, true);
    });
}

function countsMessage(counts: { identityApplied: number; healthApplied: number }): string {
    return `${strings.codex.library.refreshed} ${String(counts.identityApplied)} · ${String(counts.healthApplied)}`;
}

/**
 * Blocking and unblocking are the same operation with a different set, and
 * both must rebuild: blocking has to actually remove the contribution (a
 * `max`-joined weight does not go away by filtering at read time), and
 * unblocking has to put it back.
 */
async function setTrust(authorId: string | null, trusted: boolean): Promise<void> {
    if (!authorId) return;
    await run(async () => {
        if (trusted) await unblockAuthor(authorId);
        else await blockAuthor(authorId);
        return countsMessage(await rebuildFromLibrary());
    });
}

/** Refreshes subscriptions on boot, honouring the TTL — a reload inside the window makes no upstream requests at all. */
export async function refreshCodexLibraryOnBoot(): Promise<void> {
    try {
        const summary = await refreshSubscriptions();
        await publishCodexLibrary();
        if (summary.counts.identityApplied + summary.counts.healthApplied > 0) refreshLiveRows();
    } catch {
        // Non-fatal by design: shared Codexes are an enhancement, and a
        // device that is offline or whose host is down must still boot.
    }
}
