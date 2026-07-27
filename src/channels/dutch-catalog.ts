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
    // --- Public broadcasters ---
    { canonical: 'NPO 1', rank: 100, aliases: ['NPO1', 'NED 1', 'NEDERLAND 1'] },
    { canonical: 'NPO 2', rank: 110, aliases: ['NPO2', 'NED 2', 'NEDERLAND 2'] },
    { canonical: 'NPO 3', rank: 120, aliases: ['NPO3', 'NED 3', 'NEDERLAND 3'] },
    { canonical: 'NPO 1 Extra', rank: 130, aliases: ['NPO1 EXTRA', 'NPO EXTRA'] },
    { canonical: 'NPO 2 Extra', rank: 140, aliases: ['NPO2 EXTRA', 'NPO CULTURA', 'CULTURA'] },
    { canonical: 'NPO Nieuws', rank: 150, aliases: ['NPO NIEUWS EN CO', 'NIEUWS'] },
    { canonical: 'NPO Politiek', rank: 160, aliases: ['NPO POLITIEK EN NIEUWS'] },
    { canonical: 'NPO Zapp', rank: 170, aliases: ['ZAPP'] },
    { canonical: 'NPO Zappelin', rank: 180, aliases: ['ZAPPELIN', 'ZAPPELIN EXTRA'] },

    // --- Commercial: RTL ---
    { canonical: 'RTL 4', rank: 200, aliases: ['RTL4'] },
    { canonical: 'RTL 5', rank: 210, aliases: ['RTL5'] },
    { canonical: 'RTL 7', rank: 220, aliases: ['RTL7'] },
    { canonical: 'RTL 8', rank: 230, aliases: ['RTL8'] },
    { canonical: 'RTL Z', rank: 240, aliases: ['RTLZ'] },
    { canonical: 'RTL Crime', rank: 250 },
    { canonical: 'RTL Lounge', rank: 260 },
    { canonical: 'RTL Telekids', rank: 270, aliases: ['TELEKIDS'] },

    // --- Commercial: Talpa/SBS ---
    { canonical: 'SBS 6', rank: 300, aliases: ['SBS6'] },
    { canonical: 'SBS 9', rank: 310, aliases: ['SBS9'] },
    { canonical: 'Net5', rank: 320, aliases: ['NET 5'] },
    { canonical: 'Veronica', rank: 330, aliases: ['VERONICA DISNEY XD'] },

    // --- Sport ---
    { canonical: 'Ziggo Sport', rank: 400, aliases: ['ZIGGO SPORT TOTAAL'] },
    { canonical: 'Ziggo Sport Select', rank: 410 },
    { canonical: 'Ziggo Sport Voetbal', rank: 420 },
    { canonical: 'Ziggo Sport Racing', rank: 430 },
    { canonical: 'Ziggo Sport Golf', rank: 440 },
    { canonical: 'Ziggo Sport Docu', rank: 450 },
    { canonical: 'ESPN 1', rank: 460, aliases: ['ESPN', 'FOX SPORTS 1', 'FOX SPORTS'] },
    { canonical: 'ESPN 2', rank: 470, aliases: ['FOX SPORTS 2'] },
    { canonical: 'ESPN 3', rank: 480, aliases: ['FOX SPORTS 3'] },
    { canonical: 'ESPN 4', rank: 490, aliases: ['FOX SPORTS 4'] },
    { canonical: 'Eurosport 1', rank: 500, aliases: ['EUROSPORT'] },
    { canonical: 'Eurosport 2', rank: 510 },

    // --- Film ---
    { canonical: 'Film1 Premiere', rank: 600, aliases: ['FILM 1 PREMIERE'] },
    { canonical: 'Film1 Action', rank: 610, aliases: ['FILM 1 ACTION'] },
    { canonical: 'Film1 Drama', rank: 620, aliases: ['FILM 1 DRAMA'] },
    { canonical: 'Film1 Family', rank: 630, aliases: ['FILM 1 FAMILY'] },

    // --- Documentary / factual ---
    { canonical: 'Discovery Channel', rank: 700, aliases: ['DISCOVERY'] },
    { canonical: 'National Geographic', rank: 710, aliases: ['NAT GEO', 'NATGEO'] },
    { canonical: 'National Geographic Wild', rank: 720, aliases: ['NAT GEO WILD', 'NATGEO WILD'] },
    { canonical: 'History', rank: 730, aliases: ['HISTORY CHANNEL'] },
    { canonical: 'Animal Planet', rank: 740 },
    { canonical: 'TLC', rank: 750 },
    { canonical: 'Investigation Discovery', rank: 760, aliases: ['ID', 'DISCOVERY ID'] },
    { canonical: '24Kitchen', rank: 770, aliases: ['24 KITCHEN'] },
    { canonical: 'BBC First', rank: 780 },
    { canonical: 'BBC Earth', rank: 790 },

    // --- Entertainment / youth ---
    { canonical: 'Comedy Central', rank: 800 },
    { canonical: 'MTV', rank: 810 },
    { canonical: 'Nickelodeon', rank: 820, aliases: ['NICK'] },
    { canonical: 'Nick Jr', rank: 830, aliases: ['NICK JUNIOR'] },
    { canonical: 'Disney Channel', rank: 840, aliases: ['DISNEY'] },
    { canonical: 'Cartoon Network', rank: 850 },

    // --- Regional ---
    { canonical: 'AT5', rank: 900 },
    { canonical: 'Omroep Brabant', rank: 910 },
    { canonical: 'Omroep Gelderland', rank: 920 },
    { canonical: 'Omroep West', rank: 930 },
    { canonical: 'Omroep Zeeland', rank: 940 },
    { canonical: 'Omrop Fryslan', rank: 950, aliases: ['OMROP FRYSLAN', 'OMROEP FRIESLAND'] },
    { canonical: 'RTV Noord', rank: 960 },
    { canonical: 'RTV Oost', rank: 970 },
    { canonical: 'RTV Drenthe', rank: 980 },
    { canonical: 'RTV Utrecht', rank: 990 },
    { canonical: 'RTV Rijnmond', rank: 1000 },
    { canonical: 'L1', rank: 1010, aliases: ['L1 TV'] },

    // --- Flemish (Dutch lists nearly always carry these) ---
    { canonical: 'een', rank: 1100, aliases: ['EEN', 'VRT 1'] },
    { canonical: 'Canvas', rank: 1110, aliases: ['VRT CANVAS'] },
    { canonical: 'VTM', rank: 1120 },
    { canonical: 'Play4', rank: 1130, aliases: ['VIER'] },
    { canonical: 'Play5', rank: 1140, aliases: ['VIJF'] },
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
