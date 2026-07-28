import { normalizeKey } from './name-parse';

/**
 * Curated catalog of Dutch (and the Flemish channels Dutch lists always
 * carry) TV channels: canonical display name, ordering rank, and the
 * aliases providers actually ship.
 *
 * Deliberately NOT the primary filter. A hard whitelist silently hides
 * every legitimate channel it has never heard of — regional broadcasters,
 * new launches, a provider's own naming quirk — and a catalog maintained
 * in this repo cannot keep up with that. So this drives:
 *
 *   - **ordering**: known channels sort in broadcast order (NPO 1, 2, 3,
 *     RTL 4…) instead of whatever order the provider dumped them in;
 *   - **canonical naming**: `NPO1`, `NED 1` and `NPO 1 HD` all display as
 *     `NPO 1` and group together;
 *   - **an optional strict mode** (Settings → "Known channels only") for
 *     when a provider's Dutch categories are full of junk.
 *
 * Unknown channels still appear by default, sorted after the known ones.
 */
export interface CatalogEntry {
    canonical: string;
    /** Lower sorts first. Grouped in broadcast-family blocks with gaps, so inserting a channel never renumbers the list. */
    rank: number;
    aliases?: readonly string[];
}

export const DUTCH_CATALOG: readonly CatalogEntry[] = [
    // --- Publieke omroep ---
    { canonical: 'NPO 1', rank: 100, aliases: ['NPO1', 'NED 1', 'NEDERLAND 1'] },
    { canonical: 'NPO 2', rank: 110, aliases: ['NPO2', 'NED 2', 'NEDERLAND 2'] },
    { canonical: 'NPO 3', rank: 120, aliases: ['NPO3', 'NED 3', 'NEDERLAND 3'] },
    { canonical: 'NPO 1 Extra', rank: 130, aliases: ['NPO1 EXTRA'] },
    { canonical: 'NPO 2 Extra', rank: 140, aliases: ['NPO2 EXTRA', 'NPO CULTURA', 'CULTURA'] },
    { canonical: 'NPO Politiek en Nieuws', rank: 150, aliases: ['NPO POLITIEK', 'NPO POLITIEK EN NIEUWS'] },
    { canonical: 'NPO Sport', rank: 160 },
    { canonical: 'NPO Nieuws', rank: 170, aliases: ['NPO NIEUWS EN CO'] },
    { canonical: 'NPO Zappelin Extra', rank: 180, aliases: ['ZAPPELIN EXTRA', 'NPO ZAPPELIN'] },

    // --- RTL ---
    { canonical: 'RTL 4', rank: 200, aliases: ['RTL4'] },
    { canonical: 'RTL 5', rank: 210, aliases: ['RTL5'] },
    { canonical: 'RTL 7', rank: 220, aliases: ['RTL7'] },
    { canonical: 'RTL 8', rank: 230, aliases: ['RTL8'] },
    { canonical: 'RTL Z', rank: 240, aliases: ['RTLZ'] },
    { canonical: 'RTL Crime', rank: 250, aliases: ['RTLCRIME'] },
    { canonical: 'RTL Lounge', rank: 260, aliases: ['RTLLOUNGE'] },
    { canonical: 'RTL Telekids', rank: 270, aliases: ['TELEKIDS', 'RTLTELEKIDS'] },

    // --- Talpa / SBS ---
    { canonical: 'SBS6', rank: 300, aliases: ['SBS 6'] },
    { canonical: 'Net5', rank: 310, aliases: ['NET 5'] },
    // Veronica and Disney XD share one Dutch channel, and providers spell
    // the pairing several ways.
    { canonical: 'Veronica', rank: 320, aliases: ['VERONICA DISNEY XD', 'VERONICA DISNEYXD', 'VERONICA DISNEY'] },
    { canonical: 'SBS9', rank: 330, aliases: ['SBS 9'] },
    { canonical: 'TV 538', rank: 340, aliases: ['TV538', 'RADIO 538 TV'] },

    // --- Entertainment / jeugd ---
    { canonical: 'Comedy Central', rank: 400, aliases: ['COMEDYCENTRAL'] },
    { canonical: 'Nickelodeon', rank: 410, aliases: ['NICK'] },
    { canonical: 'Cartoon Network', rank: 420, aliases: ['CARTOONNETWORK'] },
    { canonical: 'Disney Channel', rank: 430, aliases: ['DISNEY'] },
    { canonical: 'Disney Jr.', rank: 440, aliases: ['DISNEY JR', 'DISNEY JUNIOR'] },

    // --- Factual ---
    { canonical: 'Discovery Channel', rank: 500, aliases: ['DISCOVERY'] },
    { canonical: 'TLC', rank: 510 },
    { canonical: 'Animal Planet', rank: 520, aliases: ['ANIMALPLANET'] },
    { canonical: 'Investigation Discovery', rank: 530, aliases: ['ID', 'DISCOVERY ID', 'INVESTIGATION DISCOVERY ID'] },
    { canonical: '24Kitchen', rank: 540, aliases: ['24 KITCHEN'] },
    { canonical: 'National Geographic', rank: 550, aliases: ['NAT GEO', 'NATGEO', 'NATIONAL GEOGRAPHIC CHANNEL'] },

    // --- Sport ---
    { canonical: 'Eurosport 1', rank: 600, aliases: ['EUROSPORT'] },
    { canonical: 'Viaplay TV', rank: 610, aliases: ['VIAPLAY'] },
];

interface CatalogLookup {
    canonical: string;
    rank: number;
}

/** Alias/canonical key → entry. Built once; both forms resolve to the same canonical name. */
const BY_KEY: ReadonlyMap<string, CatalogLookup> = (() => {
    const map = new Map<string, CatalogLookup>();
    for (const entry of DUTCH_CATALOG) {
        const value = { canonical: entry.canonical, rank: entry.rank };
        map.set(normalizeKey(entry.canonical), value);
        for (const alias of entry.aliases ?? []) map.set(normalizeKey(alias), value);
    }
    return map;
})();

/** Rank for anything the catalog does not know — sorts after every known channel, but is still shown. */
export const UNKNOWN_RANK = 100_000;

export function lookupCatalog(key: string): CatalogLookup | undefined {
    return BY_KEY.get(key);
}

export function isKnownChannel(key: string): boolean {
    return BY_KEY.has(key);
}
