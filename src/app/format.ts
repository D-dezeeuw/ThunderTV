/**
 * Count-aware string formatting (Feature 07.6.9) — a `{count}` template
 * pair (singular/plural) resolved by count, shared by the Feature 07.6
 * import summary and, per this feature's own note, Phase 09's result
 * counts once that phase exists.
 */
export function pluralCount(count: number, singularTemplate: string, pluralTemplate: string): string {
    const template = count === 1 ? singularTemplate : pluralTemplate;
    return template.replace('{count}', String(count));
}
