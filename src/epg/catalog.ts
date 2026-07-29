import { normalizeKey } from '../channels/name-parse';
import type { EpgCatalogRecord } from '../core/storage';
import { stripCountrySuffix, type EpgCountry } from './countries';
import type { XmltvDocument } from './xmltv';

/**
 * Pure derivation of one country's canonical channel catalog from its
 * already-parsed XMLTV documents (Feature 31.3) — no I/O, no storage.
 * `normalizeKey` is the exact function `src/channels/grouping.ts` uses on
 * the playlist side, imported rather than reimplemented, so the matcher's
 * name-based rung (`src/epg/match.ts`) compares like with like.
 */

export interface ParsedFeedFile {
    sourceFile: string;
    document: XmltvDocument;
}

export interface CatalogDerivationStats {
    files: number;
    entries: number;
    /** Channel ids seen again in a later file — first occurrence wins (Feature 31.3.4). */
    deduped: number;
    /** Channels dropped for any other reason (e.g. an id that is nothing but the country suffix). */
    skipped: number;
}

export interface CatalogDerivationResult {
    entries: EpgCatalogRecord[];
    stats: CatalogDerivationStats;
}

/**
 * `liveToken` is the app's own `settings.liveCountry`-shaped token (`'NL'`,
 * `'UK'`) — see `src/epg/countries.ts`'s `liveTokenFor` — so every stored
 * `EpgCatalogRecord.country` matches the token the rest of the app already
 * filters on, with no translation step at any call site.
 */
export function deriveCatalog(
    liveToken: string,
    country: EpgCountry,
    files: readonly ParsedFeedFile[],
): CatalogDerivationResult {
    const byId = new Map<string, EpgCatalogRecord>();
    let deduped = 0;
    let skipped = 0;

    for (const { sourceFile, document } of files) {
        for (const channel of document.channels) {
            if (byId.has(channel.id)) {
                deduped += 1;
                continue;
            }
            const displayName = stripCountrySuffix(channel.id, country).trim();
            if (!displayName) {
                skipped += 1;
                continue;
            }
            byId.set(channel.id, {
                country: liveToken,
                id: channel.id,
                displayName,
                normKey: normalizeKey(displayName),
                icon: channel.icon,
                sourceFile,
            });
        }
    }

    const entries = [...byId.values()];
    return { entries, stats: { files: files.length, entries: entries.length, deduped, skipped } };
}
