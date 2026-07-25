/**
 * Declared data, not scattered `if (isElectron)` checks — UX decisions
 * (CORS warnings, player options, storage notices) read from this object
 * instead of re-deriving the environment (masterplan §4).
 *
 * New capabilities are added as new fields with safe-false (or safe-'none')
 * defaults, never by widening the meaning of an existing field.
 */
export interface Capabilities {
    readonly corsUnrestricted: boolean;
    readonly externalPlayers: boolean;
    readonly durableStorage: 'full' | 'partial' | 'none';
}

/**
 * Fixed web values: `corsUnrestricted` and `externalPlayers` are always
 * false in a browser — no consumer should ever need to override them for
 * this platform. `durableStorage` is the only dynamic field; it comes from
 * the Phase 04 boot-time storage probe (a temporary stub reports `'none'`
 * until then, per Feature 03.2.3, so nothing can assume persistence that
 * doesn't exist yet).
 */
export function createWebCapabilities(durableStorage: Capabilities['durableStorage']): Capabilities {
    return Object.freeze({
        corsUnrestricted: false,
        externalPlayers: false,
        durableStorage,
    });
}
