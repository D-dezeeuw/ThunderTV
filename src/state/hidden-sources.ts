import type { PlaylistSourceSummary } from './playlist';

/**
 * Sources kept out of the sidebar's picker because they carry nothing
 * playable — a provider host that answers imports but serves no working
 * channels is pure noise in a two-tap flow.
 *
 * Deliberately *hidden, never deleted*: the source stays in storage and
 * stays selectable in Settings, so this can never silently destroy an
 * import or strand a user whose provider starts working again. Matching is
 * on host only, so credentials, ports and paths in the stored URL do not
 * have to be guessed at.
 */
export const HIDDEN_SOURCE_HOSTS: readonly string[] = ['line.cloud-ott.net'];

/** Host of a stored source URL, lowercased. Null for pasted/uploaded sources, which have no URL and are never hidden. */
function hostOf(url: string | null): string | null {
    if (!url) return null;
    try {
        // Stored URLs may lack a scheme (`provider.example:8080`), which
        // `URL` would otherwise read as the scheme — the same trap
        // `normalizeXtreamUrl` hit.
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`;
        return new URL(withScheme).hostname.toLowerCase();
    } catch {
        return null;
    }
}

export function isHiddenSource(source: Pick<PlaylistSourceSummary, 'url'>): boolean {
    const host = hostOf(source.url);
    return host !== null && HIDDEN_SOURCE_HOSTS.includes(host);
}

/** The picker's list: everything except the known-dead hosts. Settings uses the unfiltered `playlist.sources`. */
export function visibleSources(sources: readonly PlaylistSourceSummary[]): PlaylistSourceSummary[] {
    return sources.filter((source) => !isHiddenSource(source));
}
