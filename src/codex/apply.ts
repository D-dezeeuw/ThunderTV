import { primeHealthCache } from '../health/store';
import { isCodexDocument, type CodexDocument } from './format';
import { blockedAuthors } from './blocklist';
import { commitKnowledge, localKnowledge } from './knowledge';
import { mergeKnowledge } from './merge';
import { verifyDocument } from './signing';
import { trustedKnowledge } from './trust';

/**
 * Taking one Codex in — parse, verify, decide how much of it to believe,
 * join, write back.
 *
 * Each of those four steps lives somewhere else on purpose: `format.ts`
 * validates shape, `signing.ts` proves authorship, `trust.ts` decides
 * weight, `merge.ts` decides order, `knowledge.ts` talks to storage. What
 * is left here is the sequence, which is the only part specific to
 * "importing a file the user picked".
 *
 * Since Phase 36 the merge is a CRDT join, so importing the same file twice
 * changes nothing and import order never changes the result. Since Phase 37
 * it also passes through the trust policy, so a signed-but-hostile file is
 * bounded rather than merely authenticated.
 */

export type CodexImportProblem = 'not-json' | 'not-a-codex' | 'bad-signature' | 'blocked-author';

export interface CodexImportResult {
    ok: boolean;
    problem?: CodexImportProblem;
    /** Fingerprint of whoever signed it — shown so a user can recognise a Codex they have taken before. */
    authorId?: string;
    identityApplied: number;
    healthApplied: number;
}

const FAILED: Omit<CodexImportResult, 'problem'> = { ok: false, identityApplied: 0, healthApplied: 0 };

/** Parses and verifies without applying anything — the shared front half of importing a file and fetching a subscription. */
export async function readCodex(text: string): Promise<{ document: CodexDocument } | { problem: CodexImportProblem }> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { problem: 'not-json' };
    }
    if (!isCodexDocument(parsed)) return { problem: 'not-a-codex' };
    if (!(await verifyDocument(parsed))) return { problem: 'bad-signature' };
    return { document: parsed };
}

/**
 * Applies a verified document to local knowledge.
 *
 * A file that fails verification never reaches here: an unsigned or tampered
 * Codex has no author to hold responsible, which is precisely what the
 * blocklist depends on existing.
 */
export async function applyDocument(document: CodexDocument): Promise<CodexImportResult> {
    const blocked = await blockedAuthors();
    const authorId = document.body.author.id;
    if (blocked.has(authorId)) return { ...FAILED, problem: 'blocked-author', authorId };

    const incoming = trustedKnowledge(document.body, { blocked, nowMs: Date.now() });
    const countries = [...new Set(incoming.identity.map((claim) => claim.country))];

    const merged = mergeKnowledge(await localKnowledge(countries, 'merged'), incoming);
    const counts = await commitKnowledge(merged, countries, document.body.generatedAt);
    await primeHealthCache();

    return { ok: true, authorId, ...counts };
}

export async function importCodex(text: string): Promise<CodexImportResult> {
    const read = await readCodex(text);
    if ('problem' in read) {
        // A bad signature still names who claimed to write it, which is what
        // the UI needs to say something more useful than "invalid file".
        return { ...FAILED, problem: read.problem };
    }
    return applyDocument(read.document);
}
