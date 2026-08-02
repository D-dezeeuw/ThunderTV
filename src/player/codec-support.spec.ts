import { describe, expect, it } from 'vitest';
import { judgeAudioCodec, judgeVideoCodec, normalizeCodecName } from './codec-support';

/**
 * The verdicts a *warning* is built from, so the interesting cases are the
 * ones where being wrong is expensive: an unrecognized codec must not become
 * "no sound", and the same AC-3 must read differently on a host that can
 * re-encode it than on one that cannot.
 */
describe('judgeAudioCodec', () => {
    it('calls Dolby and DTS silent on a browser and fine on the desktop', () => {
        for (const codec of ['ac3', 'AC-3', 'eac3', 'E-AC-3 (Dolby Digital+)', 'dts', 'truehd']) {
            expect(judgeAudioCodec(codec, false)).toBe('silent');
            expect(judgeAudioCodec(codec, true)).toBe('ok');
        }
    });

    it('stays quiet about anything it does not recognize', () => {
        // A panel writes whatever ffprobe told it, including nothing at all.
        // A warning on every title with unusual metadata would be worse than
        // no warning, since the whole feature is advisory.
        for (const codec of [undefined, null, '', 'wmav2', 'nonsense']) {
            expect(judgeAudioCodec(codec, false)).toBe('unknown');
        }
        expect(judgeAudioCodec('aac', false)).toBe('ok');
    });
});

describe('judgeVideoCodec', () => {
    it('asks the platform, because the same app answers differently in two builds', () => {
        // macOS/Windows Electron hardware-decode HEVC; a Chromium tab does not.
        const noHevc = (mime: string): boolean => !mime.includes('hvc1');
        expect(judgeVideoCodec('hevc', noHevc)).toBe('unplayable');
        expect(judgeVideoCodec('h265', () => true)).toBe('ok');
        expect(judgeVideoCodec('h264', noHevc)).toBe('ok');
    });

    it('has no opinion where it cannot probe', () => {
        expect(judgeVideoCodec('hevc', null)).toBe('unknown');
        expect(judgeVideoCodec('mpeg2video', () => true)).toBe('unknown');
    });
});

describe('normalizeCodecName', () => {
    it('keeps the first token, which is all a panel reliably fills in', () => {
        expect(normalizeCodecName('  EAC3 (Dolby Digital Plus) ')).toBe('eac3');
        expect(normalizeCodecName('h264/AVC')).toBe('h264');
    });
});
