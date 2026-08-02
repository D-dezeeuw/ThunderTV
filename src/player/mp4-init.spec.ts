import { describe, expect, it } from 'vitest';
import { readInitSegmentCodecs } from './mp4-init';

/**
 * The fixture is not hand-written: it is the real `ftyp` + `moov` the
 * bundled ffmpeg emits for `-c:v copy -c:a aac -movflags
 * frag_keyframe+empty_moov+default_base_moof` (H.264 Constrained Baseline
 * 4.2 in, AAC-LC out) — the exact bytes `transcode-engine.ts` has to make
 * sense of before it may append anything. A synthetic buffer would only
 * ever prove that the parser agrees with the test's idea of the format.
 */
const INIT_SEGMENT_BASE64 =
    'AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAABNhtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAA' +
    'AAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC' +
    'AAAB/HRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAA' +
    'AAEAAAAAAAAAAAAAAAAAAEAAAAABQAAAAPAAAAAAAZhtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAADIAAAAAAFXEAAAAAAAt' +
    'aGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAFDbWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAA' +
    'JGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAABA3N0YmwAAAC3c3RzZAAAAAAAAAABAAAAp2F2YzEAAAAAAAAA' +
    'AQAAAAAAAAAAAAAAAAAAAAABQADwAEgAAABIAAAAAAAAAAEUTGF2YzYwLjMuMTAwIGxpYngyNjQAAAAAAAAAAAAAAAAY//8A' +
    'AAAtYXZjQwFCwA3/4QAWZ0LADdoFB+wEQAAAAwBAAAAMg8UKqAEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAA' +
    'AAI14wACNeMAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAA' +
    'AAAAAAAAAb90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAAAAAEAAAAAAAAAAAAA' +
    'AAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAFbbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAC7gAAAAABVxAAA' +
    'AAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAABBm1pbmYAAAAQc21oZAAAAAAAAAAAAAAA' +
    'JGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAAynN0YmwAAAB+c3RzZAAAAAAAAAABAAAAbm1wNGEAAAAAAAAA' +
    'AQAAAAAAAAAAAAEAEAAAAAC7gAAAAAAANmVzZHMAAAAAA4CAgCUAAgAEgICAF0AVAAAAAAENiAABDYgFgICABRGIVuUABoCA' +
    'gAECAAAAFGJ0cnQAAAAAAAENiAABDYgAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAA' +
    'AAAAAAAAEHN0Y28AAAAAAAAAAAAAAEhtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAgdHJleAAAAAAA' +
    'AAACAAAAAQAAAAAAAAAAAAAAAAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAA' +
    'AAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjAuMy4xMDA=';

const INIT_SEGMENT = Uint8Array.from(atob(INIT_SEGMENT_BASE64), (c) => c.charCodeAt(0));

describe('readInitSegmentCodecs', () => {
    it('reads the profile/compatibility/level trio ffmpeg wrote into avcC', () => {
        const codecs = readInitSegmentCodecs(INIT_SEGMENT);

        // 0x42 0xc0 0x0d — Constrained Baseline, level 1.3, as generated.
        expect(codecs?.video).toBe('avc1.42c00d');
        expect(codecs?.audio).toBe('mp4a.40.2');
        expect(codecs?.mime).toBe('video/mp4; codecs="avc1.42c00d,mp4a.40.2"');
    });

    it('says "not yet" for every prefix of a moov rather than half an answer', () => {
        // The caller appends network chunks and re-asks; a codec string
        // built from a truncated box would be a lie MediaSource acts on.
        for (const cut of [8, 32, 200, 900, INIT_SEGMENT.length - 1]) {
            expect(readInitSegmentCodecs(INIT_SEGMENT.subarray(0, cut))).toBeNull();
        }
    });

    it('declines a stream whose video track is not H.264', () => {
        // `avc1` → `hvc1` in the sample entry: still a well-formed moov, but
        // not one this can name — and naming it wrong is worse than not
        // transcoding at all.
        const hevc = INIT_SEGMENT.slice();
        const at = indexOfAscii(hevc, 'avc1');
        hevc.set([...'hvc1'].map((c) => c.charCodeAt(0)), at);

        expect(readInitSegmentCodecs(hevc)).toBeNull();
    });

    it('returns null for anything that is not an init segment at all', () => {
        expect(readInitSegmentCodecs(new Uint8Array(0))).toBeNull();
        expect(readInitSegmentCodecs(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
        expect(readInitSegmentCodecs(new TextEncoder().encode('#EXTM3U\n#EXT-X-ENDLIST'))).toBeNull();
    });
});

function indexOfAscii(bytes: Uint8Array, needle: string): number {
    const target = [...needle].map((c) => c.charCodeAt(0));
    for (let i = 0; i + target.length <= bytes.length; i += 1) {
        if (target.every((code, offset) => bytes[i + offset] === code)) return i;
    }
    return -1;
}
