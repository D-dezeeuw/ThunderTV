// Types for the generator's exports, so `spektrum-csp.spec.mts` can import it
// directly rather than shelling out. `allowJs` is off repo-wide (tsconfig.json)
// on purpose — scripts/ is plain ESM and stays that way; this declares only the
// three functions the spec uses.
export function extractExpressions(html: string): string[];
export function normalizeNumericPaths(source: string): string;
export function emitClassicPrecompileSource(expressions: string[]): string;
export function expectedGeneratedSource(): string;
export function expectedRuntimeSource(): string;
export function runtimeCacheCap(): number | null;
export const generatedPath: string;
export const runtimePath: string;
