import { EPG_FEED_THROUGH } from './epg-settings';
import type { KeyMeta } from './registry';

/**
 * `KEY_REGISTRY`'s second overflow file. `registry-overflow.ts` documents
 * the pattern and the reason for it — both it and `registry-keys.ts` now sit
 * on the 400-line `max-lines` ceiling, so a new key needs a new file rather
 * than prose trimmed out of an existing entry. Split by owner this time, so
 * the next EPG key has an obvious home instead of landing wherever there
 * happened to be room.
 */
export const EPG_REGISTRY_ENTRIES: Record<string, KeyMeta> = {
    [EPG_FEED_THROUGH]: {
        owner: 'settings',
        persisted: true,
        description:
            'Epoch ms of the newest programme stop in the last parsed XMLTV feed, 0 before any parse. Persisted because it must outlive the data it describes: prune.ts deletes every programme past its stop + 24h, so against a feed that has stopped updating the stored rows are gone and only this value still says how far the source actually reaches.',
    },
};
