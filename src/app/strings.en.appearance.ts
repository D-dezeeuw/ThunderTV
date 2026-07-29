/**
 * Settings → Appearance copy (density, theme, text size — Phase 22 theme
 * refresh), split out of `strings.en.ts` when the theme/text-size controls
 * pushed it over the 400-line `max-lines` cap — the same "split into its
 * own file, merge via a spread" precedent `strings.en.epg.ts` documents.
 * Assigned as the whole `settings.appearance` object in `strings.en.ts`.
 */
export const enAppearance = {
    density: 'Density',
    densityCompact: 'Compact',
    densityComfortable: 'Comfortable',
    theme: 'Theme',
    themeAuto: 'Auto',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeHelp: 'Auto follows your system’s light/dark setting.',
    fontSize: 'Text size',
    fontSizeSmall: 'Small',
    fontSizeDefault: 'Default',
    fontSizeLarge: 'Large',
    fontSizeXlarge: 'Extra large',
    fontSizeHelp: 'Scales text only — list row heights follow Density.',
} as const;
