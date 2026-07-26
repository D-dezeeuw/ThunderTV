/**
 * Real Xtream providers send `"42"` for 42, `1`/`"1"` for booleans, and
 * `{"0": {...}, "1": {...}}` instead of a real array. A thin tolerance
 * layer at the boundary (Phase 19 Feature 19.7) — normalized internal
 * types never see the raw wire shape.
 */
export function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

export function asString(value: unknown): string | undefined {
    if (typeof value === 'string') return value === '' ? undefined : value;
    if (typeof value === 'number') return String(value);
    return undefined;
}

export function asBool01(value: unknown): boolean {
    return value === 1 || value === '1' || value === true;
}

/** Converts the classic object-as-array payload (`{"0": {...}, "1": {...}}`) into a real array; passes a real array through unchanged. */
export function asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object') return Object.values(value) as T[];
    return [];
}
