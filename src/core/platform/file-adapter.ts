/** Result of a successful pick — the raw `File` stays attached so callers can stream bytes later (e.g. gzip XMLTV) without re-picking. */
export interface PickedFile {
    name: string;
    size: number;
    file: File;
}

export type ReadTextResult =
    | { kind: 'ok'; text: string }
    | { kind: 'too-large'; sizeBytes: number; limitBytes: number };

/**
 * File upload is a first-class, always-working import path on the web (no
 * CORS involved) — this wraps the `<input type="file">` dance behind a
 * clean promise API so callers never touch the DOM directly.
 */
export interface FileAdapter {
    /** Resolves `null` if the user cancels the picker. Must be called synchronously from a user gesture — browsers silently ignore a programmatic click() otherwise. */
    pickFile(accept: string): Promise<PickedFile | null>;
    /** A classified result, not a throw, once a file exceeds the size guard — see Feature 03.7.3. */
    readText(file: File): Promise<ReadTextResult>;
}
