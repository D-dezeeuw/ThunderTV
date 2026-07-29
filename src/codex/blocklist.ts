import { getPlatform } from '../core/platform';

/**
 * Who this device has stopped believing.
 *
 * Its own module, and not part of `library.ts`, for a dull but load-bearing
 * reason: `apply.ts` must consult the blocklist on every import, and
 * `library.ts` must call `apply.ts` to take a fetched subscription in. Put
 * the blocklist in the library and those two files import each other.
 *
 * A blocked author is dropped at ingest rather than filtered at read time,
 * so rebuilding from the retained Codexes lands on exactly the state this
 * device would have had if it had never fetched them
 * (`library.ts`'s `rebuildFromLibrary`). That is the whole reason the raw
 * documents are kept: without them, "prune retroactively" would mean
 * "forget everything and start again".
 */

const BLOCKLIST_KEY = 'codex.blocked';

export async function blockedAuthors(): Promise<ReadonlySet<string>> {
    const stored = await getPlatform().storage.get<string[]>(BLOCKLIST_KEY);
    return new Set(Array.isArray(stored) ? stored : []);
}

/** Sorted so the stored value is stable, which keeps it diffable and comparable between devices. */
async function write(authors: ReadonlySet<string>): Promise<void> {
    await getPlatform().storage.set(BLOCKLIST_KEY, [...authors].sort());
}

export async function blockAuthor(authorId: string): Promise<void> {
    const blocked = new Set(await blockedAuthors());
    blocked.add(authorId);
    await write(blocked);
}

export async function unblockAuthor(authorId: string): Promise<void> {
    const blocked = new Set(await blockedAuthors());
    blocked.delete(authorId);
    await write(blocked);
}
