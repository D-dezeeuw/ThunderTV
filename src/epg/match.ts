import { lookupCatalog } from '../channels/dutch-catalog';
import type { GroupedChannel } from '../channels/grouping';
import { normalizeKey } from '../channels/name-parse';
import { getPlatform } from '../core/platform';
import type { EpgCatalogRecord } from '../core/storage';

/**
 * Resolver v0 (Feature 31.5) — binds playlist channels to catalog channel
 * identities. Deliberately the seam Vision 3.0's stone 5 later replaces
 * with semantic matching: everything downstream only ever sees the
 * `EpgChannelMatch[]` mapping, never this ladder's strategy.
 *
 * Adapted from the phase plan's literal 3-rung ladder (tvg-id → name →
 * curated-alias) to fit how `src/channels/grouping.ts` actually works:
 * `GroupedChannel.key` has *already* been resolved through
 * `DUTCH_CATALOG`'s aliases by `resolveIdentity()` before this module ever
 * sees it, so re-running the same lookup on the same key would be dead
 * code. The alias table earns its keep on the *catalog* side instead: a
 * feed id like `NED1.nl` normalizes to a key `DUTCH_CATALOG` recognizes as
 * an alias for `NPO 1`, so that catalog entry is indexed under `NPO 1`'s
 * normalized key too — which is exactly the key a playlist row already
 * carries once grouping.ts has resolved it. `NED 1 → NPO 1 → NPO 1.nl`
 * (the plan's own example) still matches; so does the mirror case the
 * literal reading would have missed.
 */
export type MatchMethod = 'tvg-id' | 'name' | 'alias';

export interface EpgChannelMatch {
    channelKey: string;
    catalogId: string;
    method: MatchMethod;
}

export interface MatchResult {
    matches: EpgChannelMatch[];
    unmatchedChannels: string[];
    unmatchedCatalog: string[];
}

interface IndexedCandidate {
    entry: EpgCatalogRecord;
    method: MatchMethod;
}

/** Every catalog entry indexed under its own normKey (`'name'`), plus — when the curated catalog recognizes that normKey as an alias — under the canonical's normKey too (`'alias'`), so a playlist row already alias-resolved by `grouping.ts` still finds a feed entry spelled differently. */
function buildNormKeyIndex(catalog: readonly EpgCatalogRecord[]): Map<string, IndexedCandidate[]> {
    const index = new Map<string, IndexedCandidate[]>();
    const add = (key: string, candidate: IndexedCandidate): void => {
        const bucket = index.get(key);
        if (bucket) bucket.push(candidate);
        else index.set(key, [candidate]);
    };

    for (const entry of catalog) {
        add(entry.normKey, { entry, method: 'name' });
        const known = lookupCatalog(entry.normKey);
        if (known) {
            const canonicalKey = normalizeKey(known.canonical);
            if (canonicalKey !== entry.normKey) add(canonicalKey, { entry, method: 'alias' });
        }
    }
    return index;
}

/** Deterministic tiebreak for a normKey collision (Feature 31.5.4): prefer the candidate whose display name matches the channel's own resolved name exactly, else the lexicographically first catalog id — never input order, which a re-derive could shuffle. */
function pickCandidate(candidates: readonly IndexedCandidate[], channel: GroupedChannel): IndexedCandidate {
    if (candidates.length === 1) return candidates[0]!;
    const exact = candidates.find((c) => c.entry.displayName === channel.name);
    if (exact) return exact;
    return [...candidates].sort((a, b) => a.entry.id.localeCompare(b.entry.id))[0]!;
}

function matchOne(
    channel: GroupedChannel,
    byId: ReadonlyMap<string, EpgCatalogRecord>,
    index: ReadonlyMap<string, IndexedCandidate[]>,
): IndexedCandidate | null {
    if (channel.tvgId) {
        const entry = byId.get(channel.tvgId);
        if (entry) return { entry, method: 'tvg-id' };
    }

    const candidates = index.get(channel.key);
    if (!candidates || candidates.length === 0) return null;
    // A direct name hit always wins over an alias-bridged one for the same key.
    const nameOnly = candidates.filter((c) => c.method === 'name');
    return pickCandidate(nameOnly.length > 0 ? nameOnly : candidates, channel);
}

/**
 * Pure, synchronous, one pass over `channels` (Feature 31.5.7) — Map
 * lookups only, no nested scans, so it stays well under budget even for a
 * large country's catalog. Output order is `channels`' own order, sorted by
 * `channelKey` at the end (Feature 31.5.4's determinism: independent of any
 * shuffling of the input array).
 */
export function matchChannels(channels: readonly GroupedChannel[], catalog: readonly EpgCatalogRecord[]): MatchResult {
    const byId = new Map(catalog.map((entry) => [entry.id, entry] as const));
    const index = buildNormKeyIndex(catalog);

    const matches: EpgChannelMatch[] = [];
    const unmatchedChannels: string[] = [];
    const matchedCatalogIds = new Set<string>();

    for (const channel of channels) {
        const found = matchOne(channel, byId, index);
        if (found) {
            matches.push({ channelKey: channel.key, catalogId: found.entry.id, method: found.method });
            matchedCatalogIds.add(found.entry.id);
        } else {
            unmatchedChannels.push(channel.key);
        }
    }

    matches.sort((a, b) => a.channelKey.localeCompare(b.channelKey));
    const unmatchedCatalog = catalog.filter((entry) => !matchedCatalogIds.has(entry.id)).map((entry) => entry.id);

    return { matches, unmatchedChannels, unmatchedCatalog };
}

/** The shape `epg-load.ts` needs (Feature 31.5.8): which feed channel ids are worth storing programs for. */
export function matchedCatalogIds(result: MatchResult): ReadonlySet<string> {
    return new Set(result.matches.map((m) => m.catalogId));
}

interface StoredMapping {
    savedAt: number;
    matches: EpgChannelMatch[];
}

function mappingKey(country: string): string {
    return `epg.mapping.${country}`;
}

/**
 * Persists the mapping as a small kv snapshot (Feature 31.5.5) — restores
 * on boot before the playlist re-matches, and is the Codex v0 (stone 4)
 * export candidate: evidence about channel identity, storage-owned, never
 * a Spektrum key (Feature 31.5.6).
 */
export async function saveMapping(country: string, result: MatchResult): Promise<void> {
    await getPlatform().storage.set(mappingKey(country), { savedAt: Date.now(), matches: result.matches });
}

export async function loadMapping(country: string): Promise<EpgChannelMatch[]> {
    const stored = await getPlatform().storage.get<StoredMapping>(mappingKey(country));
    return stored?.matches ?? [];
}
