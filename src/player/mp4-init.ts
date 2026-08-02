/**
 * Reading the codec string out of a fragmented-MP4 initialisation segment.
 *
 * `MediaSource.addSourceBuffer()` demands a full MIME type — `video/mp4;
 * codecs="avc1.640028,mp4a.40.2"` — before a single byte can be appended,
 * and there is nowhere to look it up: the desktop transcode route
 * (`transcode-engine.ts`) is handed a stream whose video is a straight copy
 * of whatever the provider's file contained. Guessing a profile/level is a
 * bet on the whole feature working, so this reads the answer out of the
 * `moov` the stream starts with instead.
 *
 * Pure and buffer-shaped on purpose: the caller accumulates chunks off the
 * network and calls this after each one, getting `null` until enough has
 * arrived — "not yet" and "not something we can play" are the same answer
 * here, because the caller's response to both is to stop and leave the
 * viewer with the message the web build shows.
 *
 * H.264 only, deliberately. `avcC` states profile/compatibility/level in
 * three consecutive bytes, which is exactly the `avc1.PPCCLL` string; HEVC's
 * `hvcC` needs bit-reversed compatibility flags and a constraint-byte tail,
 * and an HEVC file is not what this feature exists for — it does not play in
 * Chromium today with or without this route.
 */

/** Bytes of fixed fields before the child boxes of a sample entry, by kind. */
const VISUAL_ENTRY_HEADER = 78;
const AUDIO_ENTRY_HEADER = 28;
const BOX_HEADER = 8;

export interface InitSegmentCodecs {
    /** Ready for `addSourceBuffer()` — the tracks actually present, in `video,audio` order. */
    mime: string;
    /** RFC 6381 codec strings, `null` for a track this segment does not carry. */
    video: string | null;
    audio: string | null;
}

interface Box {
    type: string;
    /** Payload bounds, header excluded. */
    start: number;
    end: number;
    /** Where the next sibling starts. */
    next: number;
}

/**
 * Walks the boxes between `start` and `end`. Returns `null` — rather than
 * what it managed to read — the moment a box claims to run past the end of
 * the buffer, since a truncated `moov` is indistinguishable from a
 * malformed one and both mean "do not build a codec string from this".
 */
function readBoxes(view: DataView, start: number, end: number): Box[] | null {
    const boxes: Box[] = [];
    let offset = start;
    while (offset + BOX_HEADER <= end) {
        const size = view.getUint32(offset);
        let header = BOX_HEADER;
        let boxSize = size;
        if (size === 1) {
            // 64-bit `largesize`. Nothing in an init segment is 4 GB, but
            // reading past it silently would be worse than declining.
            if (offset + 16 > end) return null;
            const high = view.getUint32(offset + 8);
            if (high !== 0) return null;
            boxSize = view.getUint32(offset + 12);
            header = 16;
        } else if (size === 0) {
            boxSize = end - offset;
        }
        if (boxSize < header || offset + boxSize > end) return null;
        const type = typeAt(view, offset + 4);
        boxes.push({ type, start: offset + header, end: offset + boxSize, next: offset + boxSize });
        offset += boxSize;
    }
    return boxes;
}

function typeAt(view: DataView, offset: number): string {
    let type = '';
    for (let i = 0; i < 4; i += 1) type += String.fromCharCode(view.getUint8(offset + i));
    return type;
}

function findBox(view: DataView, start: number, end: number, path: string[]): Box | null {
    const [head, ...rest] = path;
    if (!head) return null;
    const boxes = readBoxes(view, start, end);
    if (!boxes) return null;
    const match = boxes.find((box) => box.type === head);
    if (!match) return null;
    return rest.length === 0 ? match : findBox(view, match.start, match.end, rest);
}

/** `stsd` is a full box (version/flags) plus an entry count, then the sample entries themselves. */
function firstSampleEntry(view: DataView, stsd: Box): Box | null {
    const entriesStart = stsd.start + 8;
    if (entriesStart > stsd.end) return null;
    return readBoxes(view, entriesStart, stsd.end)?.[0] ?? null;
}

function avcCodec(view: DataView, entry: Box): string | null {
    const config = findBoxAfterFixedHeader(view, entry, VISUAL_ENTRY_HEADER, 'avcC');
    if (!config || config.end - config.start < 4) return null;
    const hex = (offset: number): string => view.getUint8(offset).toString(16).padStart(2, '0');
    // configurationVersion, then profile / profile-compatibility / level —
    // the three bytes `avc1.PPCCLL` is spelled from.
    return `avc1.${hex(config.start + 1)}${hex(config.start + 2)}${hex(config.start + 3)}`;
}

function findBoxAfterFixedHeader(view: DataView, entry: Box, fixed: number, type: string): Box | null {
    const childrenStart = entry.start + fixed;
    if (childrenStart > entry.end) return null;
    return readBoxes(view, childrenStart, entry.end)?.find((box) => box.type === type) ?? null;
}

export function readInitSegmentCodecs(bytes: Uint8Array): InitSegmentCodecs | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const moov = readBoxes(view, 0, bytes.byteLength)?.find((box) => box.type === 'moov');
    if (!moov) return null;

    const traks = readBoxes(view, moov.start, moov.end)?.filter((box) => box.type === 'trak') ?? [];
    let video: string | null = null;
    let audio: string | null = null;

    for (const trak of traks) {
        const stsd = findBox(view, trak.start, trak.end, ['mdia', 'minf', 'stbl', 'stsd']);
        if (!stsd) continue;
        const entry = firstSampleEntry(view, stsd);
        if (!entry) continue;
        if (entry.type === 'avc1' || entry.type === 'avc3') {
            video ??= avcCodec(view, entry);
        } else if (entry.type === 'mp4a') {
            // Always our own encoder's output (`-c:a aac` — AAC-LC), so the
            // object type is known without decoding the `esds` descriptors.
            audio ??= findBoxAfterFixedHeader(view, entry, AUDIO_ENTRY_HEADER, 'esds') ? 'mp4a.40.2' : null;
        }
    }

    // A track this cannot name is a track MediaSource would reject the
    // stream over, so a partial answer is not a usable one.
    if (!video && !audio) return null;
    if (traks.length > 0 && traks.length !== [video, audio].filter(Boolean).length) return null;
    return { mime: `video/mp4; codecs="${[video, audio].filter(Boolean).join(',')}"`, video, audio };
}
