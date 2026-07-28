/**
 * Triggers a browser download of in-memory text. A Blob URL rather than a
 * `data:` URI because a full configuration export can be tens of megabytes,
 * well past the length limit browsers enforce on data URIs.
 */
export function downloadTextFile(filename: string, mimeType: string, contents: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    // Not appended to the document: a detached anchor still dispatches a
    // click in every browser this targets, and nothing is left behind to
    // clean up if the download is cancelled.
    anchor.click();
    // Revoking synchronously can cancel the download in some browsers, so
    // this waits a turn — the object is small (a handle, not the payload).
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
