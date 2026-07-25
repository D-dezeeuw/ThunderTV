import { KEY_REGISTRY } from './registry';

/**
 * The masterplan §5.4/§5.8 discipline as enforceable architecture: anything
 * that can exceed ~1000 items lives in module memory and storage
 * (`src/m3u/channel-memory.ts` once Phase 06 lands), never Spektrum state —
 * a 100k-channel import must record zero row-bearing mutations.
 */
export const MAX_RECORDED_COLLECTION = 1000;

/**
 * Dev-mode-only guard (Feature 05.8.1/05.8.2): warns when a `setValue`
 * payload's array length exceeds either the global ceiling or the key's own
 * registered `maxItems` (Feature 05.8.5). Call from the action helper
 * (`state/typed.ts`) — never from production code paths directly, and never
 * throws: a warning that ships loud in dev must not become a crash a user
 * hits in prod if this file is ever reached there by mistake.
 */
export function assertCompact(key: string, value: unknown): void {
    if (!Array.isArray(value)) return;
    const limit = KEY_REGISTRY[key]?.maxItems ?? MAX_RECORDED_COLLECTION;
    if (value.length > limit) {
        console.warn(
            `[ThunderTV] state: setValue("${key}", […]) carried ${String(value.length)} items — recorded state must stay compact (limit ${String(limit)}). Bulk data belongs in storage + module memory, not Spektrum state (masterplan §5.4/§5.8).`,
        );
    }
}
