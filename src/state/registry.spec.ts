import { describe, expect, it } from 'vitest';
import { PLAYER_ACTIVE, PLAYER_ZAP_HISTORY, ZAP_HISTORY_CAP } from './player';
import { PLAYLIST_SOURCES } from './playlist';
import { isPersistedKey, isRegisteredKey, keyVersion, KEY_REGISTRY, NON_REGISTRY_KEYS, persistedKeys } from './registry';

describe('KEY_REGISTRY', () => {
    it('registers every key with an owner from the twelve state modules', () => {
        const owners = new Set([
            'playlist', 'import', 'player', 'epg', 'settings', 'ui', 'list', 'favorites',
            'vod', 'series', 'search', 'downloads',
        ]);
        for (const meta of Object.values(KEY_REGISTRY)) {
            expect(owners.has(meta.owner)).toBe(true);
        }
    });

    it('isRegisteredKey is true for a known key and false for an unknown one', () => {
        expect(isRegisteredKey(PLAYER_ACTIVE)).toBe(true);
        expect(isRegisteredKey('not.a.real.key')).toBe(false);
    });

    it('isPersistedKey reflects the registry, including for an unregistered key', () => {
        expect(isPersistedKey(PLAYER_ACTIVE)).toBe(true);
        expect(isPersistedKey(PLAYLIST_SOURCES)).toBe(false);
        expect(isPersistedKey('not.a.real.key')).toBe(false);
    });

    it('keyVersion defaults to 1 when the entry omits an explicit version', () => {
        expect(keyVersion(PLAYER_ACTIVE)).toBe(1);
        expect(keyVersion('not.a.real.key')).toBe(1);
    });

    it('persistedKeys() returns exactly the keys marked persisted:true', () => {
        const keys = persistedKeys();
        for (const key of keys) {
            expect(KEY_REGISTRY[key]?.persisted).toBe(true);
        }
        for (const [key, meta] of Object.entries(KEY_REGISTRY)) {
            if (meta.persisted) expect(keys).toContain(key);
        }
    });

    it('player.zapHistory carries the maxItems ceiling the collections helper enforces', () => {
        expect(KEY_REGISTRY[PLAYER_ZAP_HISTORY]?.maxItems).toBe(ZAP_HISTORY_CAP);
    });

    it('NON_REGISTRY_KEYS documents "strings" as deliberately outside the registry', () => {
        expect(NON_REGISTRY_KEYS).toContain('strings');
        expect(isRegisteredKey('strings')).toBe(false);
    });
});
