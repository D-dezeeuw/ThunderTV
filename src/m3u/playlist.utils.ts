/**
 * Ported from thunder-tv's `libs/shared/m3u-utils/src/lib/playlist.utils.ts`
 * (Feature 06.1.2), trimmed to the three pure URL helpers this engine
 * actually needs — see the module-level decision note below for what was
 * dropped and why.
 */

/**
 * Returns last segment (part after last slash "/") of the given URL
 * @param value URL as string
 */
export const getFilenameFromUrl = (value: string): string => {
    if (value && value.length > 1) {
        return value.substring(value.lastIndexOf('/') + 1);
    }
    return 'Untitled playlist';
};

/**
 * Extract the file extension from a URL, ignoring query strings and fragments.
 *
 * Returns `undefined` when no real extension is found — e.g. for IPTV proxy
 * URLs like `https://proxy.example.com/ace/getstream?infohash=abc` where the
 * path segment has no dot-separated extension.
 */
export const getExtensionFromUrl = (url: string): string | undefined => {
    const path = url.split(/[#?]/)[0] ?? '';
    const lastSegment = path.split('/').pop() ?? '';
    const dotIndex = lastSegment.lastIndexOf('.');
    if (dotIndex < 1) return undefined;
    const ext = lastSegment.slice(dotIndex + 1).trim();
    return ext || undefined;
};

export const getStreamExtensionFromUrl = (url: string): string | undefined => {
    return getExtensionFromUrlQuery(url) ?? getExtensionFromUrl(url);
};

const getExtensionFromUrlQuery = (url: string): string | undefined => {
    try {
        const parsedUrl = new URL(url, 'http://thundertv.local');
        return normalizeExtensionToken(parsedUrl.searchParams.get('extension'));
    } catch {
        return undefined;
    }
};

const normalizeExtensionToken = (value: string | null | undefined): string | undefined => {
    const extension = value?.trim().replace(/^\.+/, '').toLowerCase();
    return extension || undefined;
};
