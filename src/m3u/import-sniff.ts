/**
 * Content sniffing (Feature 07.2.2/07.3.2/07.4.8) — every import path
 * (file, paste, URL) runs the *same* check before handing text to the
 * worker, since none of the three inputs can be trusted on its own: a file
 * extension can lie, a paste can be anything, and a provider's
 * `Content-Type` header is routinely wrong for M3U (`text/html`,
 * `application/octet-stream`).
 */
export function looksLikeM3u(text: string): boolean {
    // A real #EXTM3U header anywhere near the top, or at least one
    // #EXTINF line — the fork itself only requires the former, but a
    // paste/file missing just the header line (a common hand-edit mistake)
    // still deserves a friendly message instead of "invalid file", so this
    // check is intentionally slightly more permissive than the parser's
    // own "no-header" failure mode (Feature 06.7.2).
    const head = text.slice(0, 4096);
    return /#EXTM3U/i.test(head) || /#EXTINF/i.test(text);
}

/**
 * Cheap FNV-1a hash over the first 64 KB (Feature 07.7.6) — not
 * cryptographic, not collision-proof, just a fast "this looks identical to
 * an existing source" signal for file/paste imports, which have no
 * reliable URL identity to key on (`makeSourceKey` returns `null` for
 * them). A false-positive match only ever surfaces a dismissible warning
 * with an explicit "import anyway" — never a silent dedupe/skip.
 */
export function contentFingerprint(text: string): string {
    const sample = text.slice(0, 65_536);
    let hash = 0x811c9dc5;
    for (let i = 0; i < sample.length; i += 1) {
        hash ^= sample.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${String(text.length)}:${(hash >>> 0).toString(16)}`;
}
