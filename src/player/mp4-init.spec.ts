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

/**
 * The same command run over an HEVC + AC-3 source — the file this feature
 * exists for on a Mac, where the picture hardware-decodes and the sound does
 * not. Real bytes again: the profile/tier/level/constraint fields of an
 * `hvcC` are packed and bit-reversed, so a hand-built one would agree with
 * whatever the parser happened to do to it.
 */
const HEVC_INIT_SEGMENT_BASE64 =
    'AAAAHGZ0eXBpc281AAACAGlzbzVpc282bXA0MQAABSxtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAAAABAAABAAAA' +
    'AAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC' +
    'AAACUHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAA' +
    'AAEAAAAAAAAAAAAAAAAAAEAAAAAAoAAAAHgAAAAAAextZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAADIAAAAAAFXEAAAAAAAt' +
    'aGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFZpZGVvSGFuZGxlcgAAAAGXbWluZgAAABR2bWhkAAAAAQAAAAAAAAAAAAAA' +
    'JGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAABV3N0YmwAAAELc3RzZAAAAAAAAAABAAAA+2h2YzEAAAAAAAAA' +
    'AQAAAAAAAAAAAAAAAAAAAAAAoAB4AEgAAABIAAAAAAAAAAEUTGF2YzYwLjMuMTAwIGxpYngyNjUAAAAAAAAAAAAAAAAY//8A' +
    'AAB3aHZjQwEBYAAAAJAAAAAAAB7wAPz9+PgAAA8DoAABABhAAQwB//8BYAAAAwCQAAADAAADAB6VlAmhAAEAK0IBAQFgAAAD' +
    'AJAAAAMAAAMAHqAUICB8uWVlSkwvAWgIAAADAAgAAAMAyECiAAEABkQBwHPBiQAAAApmaWVsAQAAAAAQcGFzcAAAAAEAAAAB' +
    'AAAAFGJ0cnQAAAAAAAICjQACAo0AAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAA' +
    'AAAAEHN0Y28AAAAAAAAAAAAAAb90cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAAA' +
    'AAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAFbbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAA' +
    'AACsRAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAABBm1pbmYAAAAQc21o' +
    'ZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAAynN0YmwAAAB+c3RzZAAAAAAAAAABAAAA' +
    'bm1wNGEAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAACsRAAAAAAANmVzZHMAAAAAA4CAgCUAAgAEgICAF0AVAAAAAALuAAAC7gAF' +
    'gICABRIQVuUABoCAgAECAAAAFGJ0cnQAAAAAAALuAAAC7gAAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRz' +
    'dHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAEhtdmV4AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAA' +
    'AAAgdHJleAAAAAAAAAACAAAAAQAAAAAAAAAAAAAAAAAAAGF1ZHRhAAAAWW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJh' +
    'cHBsAAAAAAAAAAAAAAAALGlsc3QAAAAkqXRvbwAAABxkYXRhAAAAAQAAAABMYXZmNjAuMy4xMDA=';

const INIT_SEGMENT = Uint8Array.from(atob(INIT_SEGMENT_BASE64), (c) => c.charCodeAt(0));
const HEVC_INIT_SEGMENT = Uint8Array.from(atob(HEVC_INIT_SEGMENT_BASE64), (c) => c.charCodeAt(0));

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

    it('spells out the packed, bit-reversed fields of an hvcC', () => {
        const codecs = readInitSegmentCodecs(HEVC_INIT_SEGMENT);

        // Stored: profile byte 0x01 (space 0, main tier, profile 1),
        // compatibility 0x60000000 (which is `6` once bit-reversed), level
        // 0x1e = 30, constraints 0x90 followed by five zero bytes that the
        // string drops. Chromium prints exactly this for the same file.
        expect(codecs?.video).toBe('hvc1.1.6.L30.90');
        expect(codecs?.mime).toBe('video/mp4; codecs="hvc1.1.6.L30.90,mp4a.40.2"');
    });

    it('keeps the sample entry\'s own fourcc, since hev1 is not hvc1', () => {
        // What ffmpeg writes when the source was an MKV — i.e. most of an
        // Xtream VOD catalog. In-band parameter sets are a different
        // proposition to a browser, so the name has to say so.
        const inBand = HEVC_INIT_SEGMENT.slice();
        inBand.set([...'hev1'].map((c) => c.charCodeAt(0)), indexOfAscii(inBand, 'hvc1'));

        expect(readInitSegmentCodecs(inBand)?.video).toBe('hev1.1.6.L30.90');
    });

    it('declines a video track it still cannot name', () => {
        // `avc1` → `vp09`: a well-formed moov whose codec string this does
        // not build, and naming it wrong is worse than not transcoding.
        const vp9 = INIT_SEGMENT.slice();
        vp9.set([...'vp09'].map((c) => c.charCodeAt(0)), indexOfAscii(vp9, 'avc1'));

        expect(readInitSegmentCodecs(vp9)).toBeNull();
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
