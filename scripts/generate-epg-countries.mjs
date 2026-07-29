#!/usr/bin/env node
// Regenerates src/epg/countries-data.ts (Feature 31.1.2) against the live
// globetvapp/epg repo. A developer-run tool, never invoked at app runtime.
//
// CLI usage:
//   node scripts/generate-epg-countries.mjs
//
// What it does, in order:
//   1. For every folder in FOLDER_SEED below (name/iso2/kind — stable,
//      hand-maintained; see the note on that constant for why this isn't
//      discovered live), probes raw.githubusercontent.com with small
//      Range GETs to find its current fileCount and sample its channel-id
//      suffix from the first feed file.
//   2. Requests are sequential with a fixed spacing (politeness — never
//      flood the CDN) and each read is capped to a few hundred bytes.
//   3. On completion, rewrites the `GENERATED:START`..`GENERATED:END`
//      block in src/epg/countries-data.ts. Aborts with a clear message and
//      touches nothing on a hard failure (network down, HTTP 429/403) —
//      never retries into a rate limit, never writes partial data.
//
// Preferred alternative for step 1's *folder discovery* on a future run:
// `git clone --filter=blob:none --depth 1 <repo>` then `git ls-tree -d
// --name-only HEAD` gives the authoritative folder list with zero HTTP
// requests to the CDN and no api.github.com rate-limit exposure (that API
// is unauthenticated-rate-limited to 60 req/hour, which this repo's CI/dev
// environments hit in one call — confirmed while seeding this data on
// 2026-07-29). This script's FOLDER_SEED was captured that way; it is not
// re-discovered on every run because the folder list changes rarely and a
// git clone is a heavier dependency than this script should carry.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAW_BASE = 'https://raw.githubusercontent.com/globetvapp/epg/main';
const SPACING_MS = 300;
const MAX_FILES_PROBED = 8;
const SAMPLE_RANGE = 'bytes=0-800';
const OUTPUT_PATH = fileURLToPath(new URL('../src/epg/countries-data.ts', import.meta.url));

/**
 * folder → [iso2 ('' for a region), English display name, kind]. Hand-
 * maintained rather than derived: the repo's folder names are English-only
 * concatenations with no delimiter (`Southafrica`, `Newzealand`), so
 * splitting them into a display name algorithmically is not reliable, and
 * ISO codes are common knowledge that doesn't need a network round-trip to
 * confirm. What genuinely *needs* checking against the live repo —
 * fileCount and the channel-id suffix — is fetched below, never guessed.
 */
const FOLDER_SEED = {
    Albania: ['AL', 'Albania', 'country'],
    Argentina: ['AR', 'Argentina', 'country'],
    Australia: ['AU', 'Australia', 'country'],
    Austria: ['AT', 'Austria', 'country'],
    Belgium: ['BE', 'Belgium', 'country'],
    Bolivia: ['BO', 'Bolivia', 'country'],
    Bosnia: ['BA', 'Bosnia and Herzegovina', 'country'],
    Brazil: ['BR', 'Brazil', 'country'],
    Bulgaria: ['BG', 'Bulgaria', 'country'],
    Canada: ['CA', 'Canada', 'country'],
    Caribbean: ['', 'Caribbean', 'region'],
    Chile: ['CL', 'Chile', 'country'],
    China: ['CN', 'China', 'country'],
    Colombia: ['CO', 'Colombia', 'country'],
    Costarica: ['CR', 'Costa Rica', 'country'],
    Croatia: ['HR', 'Croatia', 'country'],
    Cyprus: ['CY', 'Cyprus', 'country'],
    Czech: ['CZ', 'Czech Republic', 'country'],
    Denmark: ['DK', 'Denmark', 'country'],
    Dominican: ['DO', 'Dominican Republic', 'country'],
    Ecuador: ['EC', 'Ecuador', 'country'],
    Egypt: ['EG', 'Egypt', 'country'],
    Elsalvador: ['SV', 'El Salvador', 'country'],
    Estonia: ['EE', 'Estonia', 'country'],
    Finland: ['FI', 'Finland', 'country'],
    France: ['FR', 'France', 'country'],
    Georgia: ['GE', 'Georgia', 'country'],
    Germany: ['DE', 'Germany', 'country'],
    Ghana: ['GH', 'Ghana', 'country'],
    Greece: ['GR', 'Greece', 'country'],
    Guatemala: ['GT', 'Guatemala', 'country'],
    Honduras: ['HN', 'Honduras', 'country'],
    Hongkong: ['HK', 'Hong Kong', 'country'],
    Hungary: ['HU', 'Hungary', 'country'],
    Iceland: ['IS', 'Iceland', 'country'],
    India: ['IN', 'India', 'country'],
    Indonesia: ['ID', 'Indonesia', 'country'],
    Ireland: ['IE', 'Ireland', 'country'],
    Israel: ['IL', 'Israel', 'country'],
    Italy: ['IT', 'Italy', 'country'],
    Ivorycoast: ['CI', 'Ivory Coast', 'country'],
    Jamaica: ['JM', 'Jamaica', 'country'],
    Kenya: ['KE', 'Kenya', 'country'],
    Korea: ['KR', 'South Korea', 'country'],
    Latvia: ['LV', 'Latvia', 'country'],
    Lithuania: ['LT', 'Lithuania', 'country'],
    Luxembourg: ['LU', 'Luxembourg', 'country'],
    Macau: ['MO', 'Macau', 'country'],
    Madagascar: ['MG', 'Madagascar', 'country'],
    Malawi: ['MW', 'Malawi', 'country'],
    Malaysia: ['MY', 'Malaysia', 'country'],
    Malta: ['MT', 'Malta', 'country'],
    Mauritius: ['MU', 'Mauritius', 'country'],
    Mexico: ['MX', 'Mexico', 'country'],
    Mongolia: ['MN', 'Mongolia', 'country'],
    Montenegro: ['ME', 'Montenegro', 'country'],
    Morocco: ['MA', 'Morocco', 'country'],
    Mozambique: ['MZ', 'Mozambique', 'country'],
    Namibia: ['NA', 'Namibia', 'country'],
    Netherlands: ['NL', 'Netherlands', 'country'],
    Newcaledonia: ['NC', 'New Caledonia', 'country'],
    Newzealand: ['NZ', 'New Zealand', 'country'],
    Nigeria: ['NG', 'Nigeria', 'country'],
    Norway: ['NO', 'Norway', 'country'],
    Pakistan: ['PK', 'Pakistan', 'country'],
    Panama: ['PA', 'Panama', 'country'],
    Paraguay: ['PY', 'Paraguay', 'country'],
    Peru: ['PE', 'Peru', 'country'],
    Philippines: ['PH', 'Philippines', 'country'],
    Poland: ['PL', 'Poland', 'country'],
    Portugal: ['PT', 'Portugal', 'country'],
    Puertorico: ['PR', 'Puerto Rico', 'country'],
    Qatar: ['QA', 'Qatar', 'country'],
    Romania: ['RO', 'Romania', 'country'],
    Russia: ['RU', 'Russia', 'country'],
    Saudiarabia: ['SA', 'Saudi Arabia', 'country'],
    Scotland: ['', 'Scotland', 'region'],
    Serbia: ['RS', 'Serbia', 'country'],
    Singapore: ['SG', 'Singapore', 'country'],
    Slovakia: ['SK', 'Slovakia', 'country'],
    Slovenia: ['SI', 'Slovenia', 'country'],
    Southafrica: ['ZA', 'South Africa', 'country'],
    Spain: ['ES', 'Spain', 'country'],
    Sports: ['', 'Sports', 'region'],
    Sweden: ['SE', 'Sweden', 'country'],
    Switzerland: ['CH', 'Switzerland', 'country'],
    Taiwan: ['TW', 'Taiwan', 'country'],
    Thailand: ['TH', 'Thailand', 'country'],
    Turkey: ['TR', 'Turkey', 'country'],
    Uae: ['AE', 'United Arab Emirates', 'country'],
    Uganda: ['UG', 'Uganda', 'country'],
    Ukraine: ['UA', 'Ukraine', 'country'],
    Unitedkingdom: ['GB', 'United Kingdom', 'country'],
    Uruguay: ['UY', 'Uruguay', 'country'],
    Usa: ['US', 'United States', 'country'],
    Uzbekistan: ['UZ', 'Uzbekistan', 'country'],
    Venezuela: ['VE', 'Venezuela', 'country'],
    Vietnam: ['VN', 'Vietnam', 'country'],
    Zambia: ['ZM', 'Zambia', 'country'],
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeFileCount(folder, prefix) {
    let count = 0;
    for (let n = 1; n <= MAX_FILES_PROBED; n++) {
        const res = await fetch(`${RAW_BASE}/${folder}/${prefix}${String(n)}.xml`, { method: 'HEAD' });
        if (res.status === 429 || res.status === 403) {
            throw new Error(`rate-limited probing ${folder} (HTTP ${String(res.status)}) — aborting, no partial write`);
        }
        if (res.status !== 200) break;
        count = n;
        await sleep(SPACING_MS);
    }
    return count;
}

function extractSuffix(sample) {
    const match = /channel id="([^"]+)"/.exec(sample);
    if (!match) return null;
    const id = match[1];
    const dot = id.lastIndexOf('.');
    if (dot === -1 || dot === id.length - 1) return null;
    const suffix = id.slice(dot + 1);
    return /^[A-Za-z]{1,4}$/.test(suffix) ? suffix.toLowerCase() : null;
}

async function sampleSuffix(folder, prefix) {
    const res = await fetch(`${RAW_BASE}/${folder}/${prefix}1.xml`, { headers: { Range: SAMPLE_RANGE } });
    if (res.status === 429 || res.status === 403) {
        throw new Error(`rate-limited sampling ${folder} (HTTP ${String(res.status)}) — aborting, no partial write`);
    }
    return extractSuffix(await res.text());
}

function formatEntry(folder, prefix, fileCount, suffix, iso2, name, kind) {
    return `    { folder: '${folder}', filePrefix: '${prefix}', fileCount: ${String(fileCount)}, suffix: '${suffix}', iso2: '${iso2}', name: '${name.replace(/'/g, "\\'")}', kind: '${kind}' },`;
}

async function main() {
    const entries = [];
    const folders = Object.keys(FOLDER_SEED).sort();

    for (const folder of folders) {
        const [iso2, name, kind] = FOLDER_SEED[folder];
        const prefix = folder.toLowerCase();

        const fileCount = await probeFileCount(folder, prefix);
        if (fileCount === 0) {
            console.warn(`[generate-epg-countries] ${folder}: no files found at ${prefix}1.xml — skipping`);
            continue;
        }
        await sleep(SPACING_MS);

        const suffix = await sampleSuffix(folder, prefix);
        if (!suffix) {
            console.warn(`[generate-epg-countries] ${folder}: could not sample a channel-id suffix — skipping`);
            continue;
        }
        await sleep(SPACING_MS);

        entries.push(formatEntry(folder, prefix, fileCount, suffix, iso2, name, kind));
        console.log(`[generate-epg-countries] ${folder}: ${String(fileCount)} file(s), suffix "${suffix}"`);
    }

    const source = readFileSync(OUTPUT_PATH, 'utf8');
    const rewritten = source.replace(
        /\/\/ GENERATED:START[\s\S]*\/\/ GENERATED:END/,
        `// GENERATED:START\nexport const EPG_COUNTRIES_DATA: readonly EpgCountry[] = [\n${entries.join('\n')}\n];\n// GENERATED:END`,
    );
    writeFileSync(OUTPUT_PATH, rewritten);
    console.log(`[generate-epg-countries] wrote ${String(entries.length)} entries to ${OUTPUT_PATH}`);
}

await main();
