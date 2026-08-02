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
 * H.264 and HEVC. `avcC` states profile/compatibility/level in three
 * consecutive bytes, which is exactly the `avc1.PPCCLL` string; `hvcC` costs
 * more work (bit-reversed compatibility flags, a constraint-byte tail) and
 * was declined at first on the grounds that HEVC does not play in Chromium
 * anyway. **That was only ever true of the web build.** macOS and Windows
 * Electron hardware-decode HEVC, which is why an HEVC film there shows a
 * perfect picture — and then, when its AC-3 audio triggers this route, the
 * one file that most needs the transcode was the one file this declined to
 * name. Whether the host can actually decode what is named stays a runtime
 * question, asked of `MediaSource.isTypeSupported()` by the caller
 * (`transcode-engine.ts`): on a host without an HEVC decoder the honest
 * failure is unchanged, it just now says which codec it was.
 *
 * VP9/AV1 are still declined. Both are cheap to name in principle, but
 * neither shows up in an Xtream VOD catalog often enough to have a fixture
 * to test against, and a codec string nobody has ever seen a real file
 * produce is a guess wearing a parser's clothes.
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

/**
 * `hvc1.PS_PP.CCCC.TLLL.BB…` out of the HEVCDecoderConfigurationRecord, per
 * ISO/IEC 14496-15 §E.3 — the same string Chromium prints for a file it can
 * play, or it will not play this one either.
 *
 * Three of the five fields are not the bytes as stored. The profile byte
 * packs `profile_space` (2 bits, spelled as a leading A/B/C when non-zero)
 * and `tier_flag` (1 bit, the `L`/`H` in front of the level) around the
 * 5-bit profile; the compatibility flags are written **bit-reversed**,
 * which is why Main profile's stored `0x60000000` is the familiar `6`; and
 * the six constraint bytes drop their trailing zeros, so a file with none
 * set contributes nothing at all rather than `.00.00.00.00.00.00`.
 *
 * The sample entry's own fourcc is echoed back rather than normalized to
 * `hvc1`: `hev1` means the parameter sets travel in-band, and a browser is
 * entitled to treat that as the different thing it is.
 */
function hevcCodec(view: DataView, entry: Box): string | null {
    const config = findBoxAfterFixedHeader(view, entry, VISUAL_ENTRY_HEADER, 'hvcC');
    if (!config || config.end - config.start < 13) return null;
    const at = (offset: number): number => view.getUint8(config.start + offset);

    const profileByte = at(1);
    const space = profileByte >>> 6;
    const tier = (profileByte >>> 5) & 0x1;
    const profile = profileByte & 0x1f;

    const compatibility = view.getUint32(config.start + 2);
    let reversed = 0;
    for (let bit = 0; bit < 32; bit += 1) reversed = (reversed << 1) | ((compatibility >>> bit) & 1);

    const constraints: string[] = [];
    for (let i = 0; i < 6; i += 1) constraints.push(at(6 + i).toString(16).padStart(2, '0'));
    while (constraints.length > 0 && constraints[constraints.length - 1] === '00') constraints.pop();

    const spaceLabel = space === 0 ? '' : String.fromCharCode(64 + space);
    const head = `${entry.type}.${spaceLabel}${String(profile)}.${(reversed >>> 0).toString(16)}`;
    return [`${head}.${tier === 0 ? 'L' : 'H'}${String(at(12))}`, ...constraints].join('.');
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
        } else if (entry.type === 'hvc1' || entry.type === 'hev1') {
            video ??= hevcCodec(view, entry);
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
