import { getPlatform } from '../core/platform';
import { setEpgProgramIndex } from './epg-index';
import { GUIDE_CHANNELS, GUIDE_LOADING, type GuideChannel, type GuideProgram } from './guide';
import { set } from './typed';

/**
 * Builds `guide.channels` from the real `epgChannels`/`epgPrograms` storage
 * tables (mirrors `favorites-load.ts`'s `loadFavoriteIds()`) — called once
 * at boot (so any previously-fetched EPG paints immediately) and again by
 * `epg-load.ts` after a fetch actually wrote new rows. Channels with no
 * stored programs are dropped here rather than at fetch time — a channel
 * whose only programs have aged out of storage should disappear from the
 * grid on the next boot even without a fresh fetch.
 */
export async function loadGuideChannels(): Promise<void> {
    set(GUIDE_LOADING, true);
    try {
        const storage = getPlatform().storage;
        const [channelRows, programRows] = await Promise.all([
            storage.getAll('epgChannels'),
            storage.getAll('epgPrograms'),
        ]);

        const byChannel = new Map<string, GuideProgram[]>();
        for (const program of programRows) {
            const bucket = byChannel.get(program.channelId);
            if (bucket) bucket.push(program);
            else byChannel.set(program.channelId, [program]);
        }
        for (const bucket of byChannel.values()) bucket.sort((a, b) => a.start - b.start);

        // The channel list's per-row now/next line reads this same bucketed,
        // sorted set synchronously on every windowed republish (Phase 32) —
        // published here rather than built separately so the one
        // `getAll('epgPrograms')` above serves both consumers, exactly like
        // `epg-load.ts`'s one-parse-two-consumers rule on the ingest side.
        setEpgProgramIndex(byChannel);

        const channels: GuideChannel[] = channelRows
            .filter((c) => (byChannel.get(c.id)?.length ?? 0) > 0)
            .map((c) => ({ id: c.id, displayName: c.displayName, icon: c.icon, programs: byChannel.get(c.id) ?? [] }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));

        set(GUIDE_CHANNELS, channels);
    } finally {
        set(GUIDE_LOADING, false);
    }
}
