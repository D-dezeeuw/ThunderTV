import { normalizeKey, parseChannelName } from '../channels/name-parse';

/**
 * Binds the Guide's channels to the ones **Live actually carries**.
 *
 * Two ingest pipelines fill `epgChannels`/`epgPrograms`, and they key their
 * rows in two different namespaces:
 *
 *  - `xtream-epg-load.ts` writes the panel's own `epg_channel_id` — the same
 *    string `src/xtream/client.ts` puts on every channel row as `tvgId`.
 *  - `epg-load.ts`'s country catalog writes its catalog id — the string
 *    `src/channels/grouping.ts` puts on a grouped channel as `epgId`, and
 *    only when `src/epg/match.ts` matched it.
 *
 * The Guide used to join on `epgId` alone. On an Xtream source that field is
 * null for nearly every row, so the join produced nothing, and the "Live
 * hasn't published yet" escape hatch handed back the panel's *entire* XMLTV
 * document sorted alphabetically — a grid full of channels the viewer's list
 * does not show, which is the "it takes the wrong channel" report.
 *
 * So the join is a ladder, strongest evidence first:
 *
 *  1. **`tvgId`** — the provider's own key on both sides. Exact, no guessing.
 *  2. **`epgId`** — the country catalog's match, for sources that serve no
 *     guide of their own.
 *  3. **The channel name** — the guide's `displayName` run through the same
 *     `parseChannelName()` the Live list already buckets on, so `NPO 1 HD`
 *     in the feed finds the `NPO 1` row. Last, because a name is a guess
 *     where the two ids are facts.
 *
 * Pure and side-effect free: it takes both sides as plain arrays so it can
 * be exercised without state, module memory, or a DOM.
 */

/** Ladder rungs, low is better — only ever compared, never stored or displayed. */
const TIER_TVG_ID = 0;
const TIER_EPG_ID = 1;
const TIER_NAME = 2;

/** The guide side of the join. `programs` is read for its length only — the tie-break when two guide channels land on the same Live row. */
export interface GuideChannelRef {
    id: string;
    displayName: string;
    programs: readonly unknown[];
}

/** The Live side — `src/channels/grouping.ts`'s `GroupedChannel`, narrowed to the four fields the ladder reads. */
export interface LiveChannelRef {
    /** The provider's own `epg_channel_id`, when the playlist carried one. */
    tvgId: string | null;
    /** The Phase 31 country-catalog match, when `src/epg/match.ts` made one. */
    epgId: string | null;
    /** `groupChannels()`'s resolved identity key — already alias-resolved and normalized. */
    key: string;
    /** Canonical display name (curated when known, else the cleanest parsed form). */
    name: string;
}

/** Every lookup the ladder needs, built once per pass rather than per guide channel. */
export interface LiveEpgIndex {
    byTvgId: Map<string, number>;
    byEpgId: Map<string, number>;
    byName: Map<string, number>;
}

/**
 * Indexes the Live channels by each rung's key. Values are the channel's
 * index in Live's own order (broadcast rank), which is what the Guide sorts
 * on — so the grid reads top to bottom the way the channel list does.
 *
 * First row wins on a duplicate key: Live is already sorted best-first, and
 * a stable choice keeps the grid from reshuffling between two rebuilds that
 * saw the same data.
 */
export function buildLiveEpgIndex(live: readonly LiveChannelRef[]): LiveEpgIndex {
    const byTvgId = new Map<string, number>();
    const byEpgId = new Map<string, number>();
    const byName = new Map<string, number>();

    live.forEach((channel, index) => {
        if (channel.tvgId && !byTvgId.has(channel.tvgId)) byTvgId.set(channel.tvgId, index);
        if (channel.epgId && !byEpgId.has(channel.epgId)) byEpgId.set(channel.epgId, index);
        // Both the resolved identity key and the canonical name's own key:
        // they're usually identical, but a curated channel's key comes from
        // the alias table while its name is the canonical spelling, and a
        // feed can be spelled either way.
        for (const key of [channel.key, normalizeKey(channel.name)]) {
            if (key && !byName.has(key)) byName.set(key, index);
        }
    });

    return { byTvgId, byEpgId, byName };
}

export interface GuideMatch {
    /** Index into the `live` array the index was built from. */
    liveIndex: number;
    /** Which rung matched — lower is stronger evidence. */
    tier: number;
}

/** Runs one guide channel down the ladder. `null` means this subscription has no row for it, which is normal and not an error. */
export function matchGuideChannel(
    index: LiveEpgIndex,
    guide: { id: string; displayName: string },
): GuideMatch | null {
    const byTvgId = index.byTvgId.get(guide.id);
    if (byTvgId !== undefined) return { liveIndex: byTvgId, tier: TIER_TVG_ID };

    const byEpgId = index.byEpgId.get(guide.id);
    if (byEpgId !== undefined) return { liveIndex: byEpgId, tier: TIER_EPG_ID };

    // `parseChannelName()` strips the "| NL |" prefix, the quality suffix and
    // the catch-up marker before normalizing — the same treatment every Live
    // row got on its way into a bucket, so the two keys are comparable. The
    // raw normalization is a second chance for a feed name the parser
    // stripped too eagerly.
    const parsedKey = parseChannelName(guide.displayName).key;
    const byName = index.byName.get(parsedKey) ?? index.byName.get(normalizeKey(guide.displayName));
    if (byName !== undefined) return { liveIndex: byName, tier: TIER_NAME };

    return null;
}

/** One grid row: the feed entry that supplies its programmes, and the Live channel it belongs to. */
export interface GuideRowBinding<G, L> {
    channel: G;
    /** The Live row this guide entry resolved to — the source of the row's *name*, so the Guide and the TV list can never disagree about what a channel is called. */
    live: L;
}

/**
 * The Guide's rows: the guide channels this subscription can actually tune,
 * at most one per Live row, in Live's order, each paired with its Live
 * channel.
 *
 * Returning the pair rather than the feed entry alone is what lets the grid
 * label a row with the name the TV list uses. A feed's own `<display-name>`
 * is the provider's spelling of a channel — sometimes a different one per
 * entry, sometimes plain wrong — and there is no reason for the Guide to
 * show anything but the name the viewer already reads in the list.
 *
 * An empty `live` returns nothing rather than the whole feed. That is the
 * deliberate part — the Guide waits for the channel list to propagate
 * instead of painting a grid of channels the viewer doesn't have, and the
 * view re-runs the moment those rows exist (`guide.selectors.ts` depends on
 * `live.stats` for exactly that).
 */
export function bindGuideChannelsToLive<G extends GuideChannelRef, L extends LiveChannelRef>(
    guide: readonly G[],
    live: readonly L[],
): GuideRowBinding<G, L>[] {
    if (live.length === 0 || guide.length === 0) return [];

    const index = buildLiveEpgIndex(live);
    // At most one guide row per Live row: a feed routinely carries `NPO 1`
    // and `NPO 1 HD` as separate entries, and both resolve to the one row the
    // list shows. Rendering both would put the same channel in the grid twice.
    const best = new Map<number, { channel: G; tier: number }>();

    for (const channel of guide) {
        const match = matchGuideChannel(index, channel);
        if (!match) continue;
        const held = best.get(match.liveIndex);
        if (!held || beatsHeld(channel, match.tier, held.channel, held.tier)) {
            best.set(match.liveIndex, { channel, tier: match.tier });
        }
    }

    return [...best.entries()]
        .sort((a, b) => a[0] - b[0])
        .flatMap(([liveIndex, held]) => {
            const row = live[liveIndex];
            return row ? [{ channel: held.channel, live: row }] : [];
        });
}

/** Strongest rung wins, then the entry with more programmes (an empty duplicate never displaces a full one), then the lexicographically first id — never input order, which a re-derive could shuffle. */
function beatsHeld<G extends GuideChannelRef>(candidate: G, candidateTier: number, held: G, heldTier: number): boolean {
    if (candidateTier !== heldTier) return candidateTier < heldTier;
    if (candidate.programs.length !== held.programs.length) return candidate.programs.length > held.programs.length;
    return candidate.id.localeCompare(held.id) < 0;
}
