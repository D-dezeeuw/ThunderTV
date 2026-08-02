import { EPG_COUNTRIES_DATA } from './countries-data';
import type { EpgCountry } from './countries';

/**
 * Every lookup into the country registry — and therefore the only module
 * that pulls the ~10 KiB generated table in.
 *
 * Split out of `countries.ts` so the table stops being eager. Its three
 * callers are all asynchronous already (`loadDefaultEpg()` and the two
 * Settings → Diagnostics EPG actions, plus the Codex export), so each one
 * `await import()`s this rather than paying for it at boot: nothing here is
 * needed before first paint, and on a Chromium 87 TV first paint is the
 * budget that matters (`scripts/check-dist.mjs`).
 *
 * `countries.ts` keeps the `EpgCountry` shape and the pure helpers that take
 * one — `feed-fetch.ts`, `catalog.ts` and `xmltv.ts` receive a country
 * object and never look one up, so they stay eager and cost nothing.
 */
export const EPG_COUNTRIES: readonly EpgCountry[] = EPG_COUNTRIES_DATA;

/** Countries only, alphabetical by display name — what a country picker should iterate. */
export function listCountries(): readonly EpgCountry[] {
    return EPG_COUNTRIES.filter((c) => c.kind === 'country').sort((a, b) => a.name.localeCompare(b.name));
}

/** Looks a country up by folder (case-insensitive), ISO code, or feed suffix — whichever the caller happens to have. */
export function findCountry(token: string): EpgCountry | undefined {
    const needle = token.trim().toLowerCase();
    if (!needle) return undefined;
    return EPG_COUNTRIES.find(
        (c) => c.folder.toLowerCase() === needle || c.iso2.toLowerCase() === needle || c.suffix.toLowerCase() === needle,
    );
}

/**
 * Bridges the app's existing `settings.liveCountry` token (`'NL'`, `'UK'`,
 * `'US'` — matched against the `"| NL |"`-style prefix providers put on
 * channels, see `src/state/settings.ts`) to a registry entry, so one user
 * choice drives both the playlist country filter and EPG feed selection.
 * Checks `suffix` before `iso2`: `Unitedkingdom`'s live token is `'UK'`,
 * which matches its `suffix` (`'uk'`) but not its `iso2` (`'GB'`) — every
 * other entry in this table has `suffix.toUpperCase() === iso2` anyway, so
 * checking `suffix` first changes nothing for them.
 */
export function countryForLiveToken(token: string): EpgCountry | undefined {
    const needle = token.trim().toUpperCase();
    if (!needle) return undefined;
    return EPG_COUNTRIES.find((c) => c.suffix.toUpperCase() === needle || c.iso2 === needle);
}
