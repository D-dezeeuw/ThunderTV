/**
 * Xtream Codes types — MVP slice. Field names follow the masterplan §6.8 /
 * Phase 19 naming (`user`/`pass`, not `username`/`password`) internally;
 * `import.ts` maps to `PlaylistRecord`'s `username`/`password` fields at the
 * storage boundary.
 */
export interface XtreamSource {
    /** Base server URL, no trailing slash, no `/player_api.php` suffix. */
    url: string;
    user: string;
    pass: string;
}

export interface XtreamCategory {
    id: string;
    name: string;
}

export interface XtreamLiveStream {
    streamId: number;
    name: string;
    categoryId: string;
    icon?: string;
    epgChannelId?: string;
}

export interface AccountStatus {
    authenticated: boolean;
    status: string;
    expiresAt: number | null;
    /** From `user_info.allowed_output_formats` — empty when the provider omits it. Drives the live-URL extension pick at import (m3u8 preferred). */
    allowedOutputFormats: string[];
}
