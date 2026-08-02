import { strings } from '../app/strings';
import { makeSourceKey } from '../core/connect/source-key';
import { getPlatform } from '../core/platform';
import type { PlaylistRecord } from '../core/storage';
import { importXtreamSource } from '../xtream/import';
import { normalizeXtreamUrl } from '../xtream/urls';
import { loadPlaylistSources } from './playlist-load';
import { PLAYLIST_ACTIVE_SOURCE_ID } from './playlist';
import { setActiveSourceId } from './playlist.actions';
import { SETTINGS_XTREAM_BUSY, SETTINGS_XTREAM_ERROR, SETTINGS_XTREAM_SAVED } from './settings';
import { toImportErrorKind } from './xtream.actions';
import { get, set } from './typed';

/**
 * Editing a source that is already configured — the Sources tab's cards
 * reopen the setup wizard on step 2, prefilled, and Save lands here.
 *
 * The whole feature is one decision: **an edited source keeps being the
 * same source.** `importXtreamSource()` (the one re-import path, shared with
 * the boot/404/manual refresh in `xtream-refresh.ts`) already replaces the
 * row whose `makeSourceKey()` matches what it just imported — so an edit
 * that only fixes a password or a typo'd port lands as a plain refresh with
 * nothing extra to do. The case that needs handling is an edit that changes
 * the *server URL or username*, because that changes the source key: the
 * upsert then finds no match, writes a second row, and the source the user
 * meant to edit sits beside it as a stale duplicate. `planSourceEdit()`
 * spots that and hands back the id to delete once the new import succeeds,
 * so the edit reads as a move rather than a fork.
 *
 * Nothing durable is keyed on the source id in a way this can strand:
 * `channels`/`groups` are re-imported wholesale (and the old ones deleted
 * with their row, exactly as a refresh already does — the upsert mints a new
 * playlist id on *every* run, so nothing in this app may assume that id is
 * stable), stream health keys on a credential-free stream fingerprint
 * (`src/health/stream-key.ts`), and favorites/recents are denormalized
 * snapshots that carry `sourceId` only for provenance. The one thing that
 * does not survive is the source's `ui.listState` entry (its scroll/group
 * cursor), which is already true of every refresh and self-heals on the
 * next visit.
 */
export interface SourceEditInput {
    url: string;
    user: string;
    pass: string;
}

/** `not-found`/`not-editable` are programmer errors (the editor only opens for a stored Xtream source); the other two are what a user can actually type. */
export type SourceEditError = 'not-found' | 'not-editable' | 'missing-fields' | 'password-required';

export type SourceEditPlan =
    | { ok: false; error: SourceEditError }
    | {
          ok: true;
          /** Exactly the `importXtreamSource()` params — never a second, edit-specific write path. */
          params: { url: string; user: string; pass: string; name: string };
          /** The edit changed `makeSourceKey()`, so the upsert will not recognise the old row as its own. */
          identityChanged: boolean;
          /** The row to delete after a successful import, or `null` when the upsert already removes it itself. */
          removeSourceId: string | null;
      };

/**
 * Pure: stored record + form input → what the save should do. Mirrors
 * `saveXtreamAccount()`'s validation rules byte-for-byte (normalize the URL,
 * require a username, blank password means "keep the stored one") so the
 * editor can never accept input the first-run form rejects, or vice versa.
 *
 * The name follows the source across an identity change: `importXtreamSource()`
 * prefers a matched existing row's name and falls back to `params.name`,
 * which is this record's — so a renamed server keeps the label the user
 * knows it by either way.
 */
export function planSourceEdit(record: PlaylistRecord | undefined, input: SourceEditInput): SourceEditPlan {
    if (!record) return { ok: false, error: 'not-found' };
    if (record.type !== 'xtream') return { ok: false, error: 'not-editable' };

    const url = normalizeXtreamUrl(input.url);
    const user = input.user.trim();
    if (!url || !user) return { ok: false, error: 'missing-fields' };

    const pass = input.pass.trim() !== '' ? input.pass : record.password;
    if (!pass) return { ok: false, error: 'password-required' };

    const identityChanged = makeSourceKey('xtream', url, user) !== makeSourceKey('xtream', record.url, record.username);
    return {
        ok: true,
        params: { url, user, pass, name: record.name },
        identityChanged,
        removeSourceId: identityChanged ? record.id : null,
    };
}

/** The stored record behind a Sources-tab card, or `undefined` — the prefill and the save both start here. */
export async function findSourceRecord(sourceId: string): Promise<PlaylistRecord | undefined> {
    return (await getPlatform().storage.getAll('playlists')).find((p) => p.id === sourceId);
}

/**
 * Applies an edit through the existing re-import path and reports whether it
 * landed. Feedback rides `settings.xtreamError`/`settings.xtreamBusy` — the
 * two keys the wizard's step 2 already binds — so a bad URL or a 401 surfaces
 * exactly where a first-run mistake does, with the modal staying open.
 */
export async function applySourceEdit(sourceId: string, input: SourceEditInput): Promise<boolean> {
    set(SETTINGS_XTREAM_ERROR, null);
    set(SETTINGS_XTREAM_SAVED, false);

    const storage = getPlatform().storage;
    const plan = planSourceEdit(await findSourceRecord(sourceId), input);
    if (!plan.ok) {
        set(SETTINGS_XTREAM_ERROR, planErrorMessage(plan.error));
        return false;
    }

    set(SETTINGS_XTREAM_BUSY, true);
    try {
        const outcome = await importXtreamSource(plan.params);
        if (!outcome.ok) {
            const kind = toImportErrorKind(outcome.error.kind);
            set(SETTINGS_XTREAM_ERROR, (strings.http.failure as Record<string, string>)[kind] ?? strings.http.failure.httpOther);
            return false;
        }

        // Only reached when the credentials themselves changed; the old row
        // survived the upsert because its key no longer matched.
        if (plan.removeSourceId !== null && plan.removeSourceId !== outcome.summary.sourceId) {
            await storage.deleteByPlaylistId('channels', plan.removeSourceId);
            await storage.deleteByPlaylistId('groups', plan.removeSourceId);
            await storage.deleteRow('playlists', plan.removeSourceId);
        }

        await loadPlaylistSources();
        // Re-aim the active pointer only when it went stale — an edit to some
        // *other* source must never switch what the viewer is watching. Asked
        // of storage rather than the just-published `playlist.sources`, whose
        // write is still queued until the next tick().
        const activeId = get<string | null>(PLAYLIST_ACTIVE_SOURCE_ID);
        if (activeId !== null && !(await storage.getAll('playlists')).some((p) => p.id === activeId)) {
            setActiveSourceId(outcome.summary.sourceId);
        }
        set(SETTINGS_XTREAM_SAVED, true);
        return true;
    } finally {
        set(SETTINGS_XTREAM_BUSY, false);
    }
}

function planErrorMessage(error: SourceEditError): string | null {
    if (error === 'missing-fields') return strings.settings.streaming.xtreamMissingFields;
    if (error === 'password-required') return strings.settings.streaming.xtreamPasswordRequired;
    // A card can only open the editor for a stored Xtream source, so these
    // two mean the row vanished underneath it — nothing the user typed, and
    // nothing an error line about credentials would explain.
    return null;
}
