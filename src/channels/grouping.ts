import type { ChannelRow, ChannelVariant as RowVariant } from '../m3u/types';
import { lookupCatalog, UNKNOWN_RANK } from './dutch-catalog';
import { classifyJunk } from './junk-filter';
import { normalizeKey, parseCategoryName, parseChannelName, QUALITY_RANK, type Quality } from './name-parse';

/**
 * Collapses a provider's flat channel dump into one row per real channel,
 * with its variants attached.
 *
 * A Dutch Xtream list carries `| NL | NPO 1 HD`, `| NL | NPO 1 FHD`,
 * `| NL | NPO 1 HD rec` and `| NL | ODIDO HD` (a provider bundle that also
 * contains NPO 1) as four separate rows. All four are the same channel, so
 * the list shows **NPO 1** once and offers the rest as variants — quality
 * switcher, catch-up feed, alternate provider.
 */

/** What the switcher shows: `HD`, `FHD · ODIDO`, `HD · catch-up`. Structurally the row-level `ChannelVariant`, with `quality` narrowed to the parsed union. */
export interface ChannelVariant extends RowVariant {
    quality: Quality | null;
}

export interface GroupedChannel {
    /** Normalized identity — stable across quality/provider spellings. */
    key: string;
    /** Canonical name when the catalog knows it, else the cleanest parsed form. */
    name: string;
    /** Best variant, and the one that plays on a plain click. */
    primary: ChannelVariant;
    variants: ChannelVariant[];
    logo: string | null;
    tvgId: string | null;
    isKnown: boolean;
    rank: number;
    /** Audio-only station (M3U `radio="true"`) — kept so `toDisplayRows()` can hand the player its radio layout. */
    radio: boolean;
}

export interface GroupingOptions {
    /** ISO country token to keep (`NL`). Rows/categories carrying a *different* country are dropped. */
    country?: string;
    /** Strict mode: keep only channels the curated catalog knows. Off by default — see `dutch-catalog.ts`. */
    knownOnly?: boolean;
    /** Drop structural junk (event slots, separators, adult). Default true. */
    dropJunk?: boolean;
    /**
     * Radio stations are a different medium, not a TV channel that happens
     * to be audio: they have no EPG, their own player layout, and a curated
     * TV catalog says nothing about them. `'exclude'` (the default) keeps
     * them out of the TV list; `'only'` builds the Radio list.
     */
    radio?: 'exclude' | 'only';
}

export interface GroupingResult {
    channels: GroupedChannel[];
    stats: {
        inputRows: number;
        keptChannels: number;
        droppedByCountry: number;
        droppedAsJunk: number;
        droppedAsUnknown: number;
        collapsedVariants: number;
    };
}

/**
 * A provider bundle prefixing its own channels (`| NL | ODIDO HD` holding
 * an `NPO 1`). The category label is the bundle name, so it becomes the
 * variant's provider tag — that is what makes "same channel, other source"
 * legible in the switcher.
 */
function providerOf(group: string | null): string | null {
    if (!group) return null;
    const { label } = parseCategoryName(group);
    const cleaned = label.replace(/\b(?:HD|FHD|UHD|4K|SD)\b/gi, '').replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned : null;
}

/**
 * Quality is the thing a viewer is actually choosing between, so it leads.
 * The category name is only worth showing when it carries information — a
 * bundle like `ODIDO HD` identifies an alternate source, while a plain
 * genre like `ENTERTAINMENT` says nothing about the feed. Rather than
 * maintaining a list of "genre" words, the category is used only where it
 * has to be: as the label for a feed with no quality marker at all, and as
 * a tiebreaker in `disambiguate()` below.
 */
function variantLabel(variant: ChannelVariant): string {
    const head = variant.quality ?? variant.provider ?? 'Alt';
    return variant.isRecording ? `${head} · catch-up` : head;
}

/**
 * Two feeds that render identically are a worse switcher than a verbose
 * one, so collisions get their category appended, and anything still
 * colliding after that gets a positional suffix. Runs once per channel
 * after sorting, so the numbering is stable between loads.
 */
function disambiguate(variants: ChannelVariant[]): void {
    const counts = new Map<string, number>();
    for (const variant of variants) counts.set(variant.label, (counts.get(variant.label) ?? 0) + 1);

    const seen = new Map<string, number>();
    for (const variant of variants) {
        if ((counts.get(variant.label) ?? 0) < 2) continue;
        const base = variant.label;
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        variant.label = variant.provider ? `${base} · ${variant.provider}` : `${base} (${n})`;
    }

    // A category shared by the colliding feeds leaves them identical again.
    const after = new Map<string, number>();
    for (const variant of variants) after.set(variant.label, (after.get(variant.label) ?? 0) + 1);
    const index = new Map<string, number>();
    for (const variant of variants) {
        if ((after.get(variant.label) ?? 0) < 2) continue;
        const n = (index.get(variant.label) ?? 0) + 1;
        index.set(variant.label, n);
        variant.label = `${variant.label} (${n})`;
    }
}

/**
 * Identity must be resolved through the catalog *before* bucketing, not
 * after: `NPO1 HD` and `Nederland 1 SD` normalize to different keys, and
 * only the alias table knows they are the same channel. Bucketing on the
 * raw parsed key would leave them as two rows that the canonical name then
 * makes look like a duplicate.
 */
function resolveIdentity(parsedKey: string, parsedBase: string): {
    key: string;
    name: string;
    rank: number;
    isKnown: boolean;
} {
    const known = lookupCatalog(parsedKey);
    if (!known) return { key: parsedKey, name: parsedBase, rank: UNKNOWN_RANK, isKnown: false };
    return { key: normalizeKey(known.canonical), name: known.canonical, rank: known.rank, isKnown: true };
}

/**
 * Live before catch-up, then best quality, then the row id — a stable
 * tiebreak so ordering never flickers between loads. Deliberately not the
 * label: labels are assigned *after* this sort (they depend on the final
 * ordering), so comparing them here would compare empty strings.
 */
function compareVariants(a: ChannelVariant, b: ChannelVariant): number {
    if (a.isRecording !== b.isRecording) return a.isRecording ? 1 : -1;
    const qa = a.quality ? QUALITY_RANK[a.quality] : 99;
    const qb = b.quality ? QUALITY_RANK[b.quality] : 99;
    if (qa !== qb) return qa - qb;
    return a.id.localeCompare(b.id);
}

export function groupChannels(rows: readonly ChannelRow[], options: GroupingOptions = {}): GroupingResult {
    const { country, knownOnly = false, dropJunk = true, radio = 'exclude' } = options;
    const wanted = country?.toUpperCase();

    const buckets = new Map<string, GroupedChannel>();
    const stats = {
        inputRows: rows.length,
        keptChannels: 0,
        droppedByCountry: 0,
        droppedAsJunk: 0,
        droppedAsUnknown: 0,
        collapsedVariants: 0,
    };

    for (const row of rows) {
        if ((radio === 'only') !== (row.radio === true)) continue;

        const parsed = parseChannelName(row.name);

        if (wanted) {
            // A row's own prefix wins; when it has none, fall back to its
            // category's — provider bundles label the category, not every
            // channel inside it.
            const rowCountry = parsed.country ?? parseCategoryName(row.group ?? '').country;
            if (rowCountry !== wanted) {
                stats.droppedByCountry += 1;
                continue;
            }
        }

        if (dropJunk && classifyJunk(parsed).isJunk) {
            stats.droppedAsJunk += 1;
            continue;
        }

        const identity = resolveIdentity(parsed.key, parsed.base);
        // The curated catalog lists TV channels only, so strict mode would
        // empty the Radio list outright — it is deliberately not applied there.
        if (knownOnly && radio !== 'only' && !identity.isKnown) {
            stats.droppedAsUnknown += 1;
            continue;
        }

        const variant: ChannelVariant = {
            id: row.id,
            url: row.url,
            label: '', // filled by variantLabel() in the finalize pass below
            quality: parsed.quality,
            isRecording: parsed.isRecording,
            provider: providerOf(row.group),
        };

        const existing = buckets.get(identity.key);
        if (existing) {
            existing.variants.push(variant);
            // Keep the first non-empty logo/EPG id we see: variants from a
            // bundle often ship neither.
            existing.logo ??= row.logo;
            existing.tvgId ??= row.tvgId;
            stats.collapsedVariants += 1;
            continue;
        }

        buckets.set(identity.key, {
            key: identity.key,
            name: identity.name,
            primary: variant,
            variants: [variant],
            logo: row.logo,
            tvgId: row.tvgId,
            isKnown: identity.isKnown,
            rank: identity.rank,
            radio: row.radio === true,
        });
    }

    const channels = [...buckets.values()];
    for (const channel of channels) {
        channel.variants.sort(compareVariants);
        for (const variant of channel.variants) variant.label = variantLabel(variant);
        disambiguate(channel.variants);
        channel.primary = channel.variants[0] ?? channel.primary;
    }
    // Catalog order first (broadcast order, not the provider's dump order),
    // then everything unknown alphabetically.
    channels.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.name.localeCompare(b.name)));

    stats.keptChannels = channels.length;
    return { channels, stats };
}

/** Flattens grouped channels back into the `ChannelRow[]` the virtual list renders, carrying variants along for the switcher. */
export function toDisplayRows(channels: readonly GroupedChannel[]): ChannelRow[] {
    return channels.map((channel) => ({
        id: channel.primary.id,
        name: channel.name,
        url: channel.primary.url,
        group: channel.primary.provider,
        logo: channel.logo,
        tvgId: channel.tvgId,
        radio: channel.radio,
        variants: channel.variants,
    }));
}
