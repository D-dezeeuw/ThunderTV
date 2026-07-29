import { describe, expect, it } from 'vitest';
import type { MediaTrack } from './tracks';
import { normalizeLangCode, pickDefaultAudioTrack, pickDefaultSubtitleTrack } from './track-prefs';

function track(id: string, lang: string, active = false): MediaTrack {
    return { id, label: lang || `Track ${id}`, lang, active };
}

describe('normalizeLangCode', () => {
    it('maps ISO 639-1/639-2 and common names to a canonical code, case-insensitively', () => {
        expect(normalizeLangCode('en')).toBe('en');
        expect(normalizeLangCode('ENG')).toBe('en');
        expect(normalizeLangCode('English')).toBe('en');
        expect(normalizeLangCode('nl')).toBe('nl');
        expect(normalizeLangCode('dut')).toBe('nl');
        expect(normalizeLangCode('nld')).toBe('nl');
        expect(normalizeLangCode('Dutch')).toBe('nl');
        expect(normalizeLangCode('nederlands')).toBe('nl');
        expect(normalizeLangCode('Flemish')).toBe('nl');
        expect(normalizeLangCode('ger')).toBe('de');
        expect(normalizeLangCode('deu')).toBe('de');
        expect(normalizeLangCode('German')).toBe('de');
        expect(normalizeLangCode('fre')).toBe('fr');
        expect(normalizeLangCode('fra')).toBe('fr');
        expect(normalizeLangCode('French')).toBe('fr');
        expect(normalizeLangCode('spa')).toBe('es');
        expect(normalizeLangCode('Spanish')).toBe('es');
        expect(normalizeLangCode('ita')).toBe('it');
        expect(normalizeLangCode('Italian')).toBe('it');
        expect(normalizeLangCode('por')).toBe('pt');
        expect(normalizeLangCode('Portuguese')).toBe('pt');
        expect(normalizeLangCode('tur')).toBe('tr');
        expect(normalizeLangCode('Turkish')).toBe('tr');
        expect(normalizeLangCode('ara')).toBe('ar');
        expect(normalizeLangCode('Arabic')).toBe('ar');
        expect(normalizeLangCode('pol')).toBe('pl');
        expect(normalizeLangCode('Polish')).toBe('pl');
        expect(normalizeLangCode('ron')).toBe('ro');
        expect(normalizeLangCode('rum')).toBe('ro');
        expect(normalizeLangCode('Romanian')).toBe('ro');
        expect(normalizeLangCode('gr')).toBe('el');
        expect(normalizeLangCode('el')).toBe('el');
        expect(normalizeLangCode('ell')).toBe('el');
        expect(normalizeLangCode('gre')).toBe('el');
        expect(normalizeLangCode('Greek')).toBe('el');
        expect(normalizeLangCode('rus')).toBe('ru');
        expect(normalizeLangCode('Russian')).toBe('ru');
        expect(normalizeLangCode('swe')).toBe('sv');
        expect(normalizeLangCode('Swedish')).toBe('sv');
        expect(normalizeLangCode('nor')).toBe('no');
        expect(normalizeLangCode('Norwegian')).toBe('no');
        expect(normalizeLangCode('dan')).toBe('da');
        expect(normalizeLangCode('Danish')).toBe('da');
        expect(normalizeLangCode('fin')).toBe('fi');
        expect(normalizeLangCode('Finnish')).toBe('fi');
    });

    it('trims whitespace before matching', () => {
        expect(normalizeLangCode('  eng  ')).toBe('en');
    });

    it('falls back to the first two letters for an unrecognized but code-shaped input', () => {
        expect(normalizeLangCode('xx')).toBe('xx');
        expect(normalizeLangCode('XYZ')).toBe('xy');
    });

    it('normalizes anything too long to plausibly be a code to empty', () => {
        expect(normalizeLangCode('klingon')).toBe('');
        expect(normalizeLangCode('not-a-lang-tag')).toBe('');
    });

    it('normalizes empty/whitespace-only input to empty', () => {
        expect(normalizeLangCode('')).toBe('');
        expect(normalizeLangCode('   ')).toBe('');
    });
});

describe('pickDefaultAudioTrack', () => {
    const tracks: MediaTrack[] = [track('0', 'fr'), track('1', 'en'), track('2', 'nl')];

    it('picks the first track matching the preferred language', () => {
        expect(pickDefaultAudioTrack(tracks, 'nl')).toBe(tracks[2]);
    });

    it('accepts aliases for the preferred language', () => {
        expect(pickDefaultAudioTrack(tracks, 'Dutch')).toBe(tracks[2]);
    });

    it('falls back to English when the preference matches nothing', () => {
        expect(pickDefaultAudioTrack(tracks, 'de')).toBe(tracks[1]);
    });

    it('falls back to English when no preference is given', () => {
        expect(pickDefaultAudioTrack(tracks, '')).toBe(tracks[1]);
    });

    it('leaves it to the engine (undefined) when neither the preference nor English is present', () => {
        const noEnglish: MediaTrack[] = [track('0', 'fr'), track('1', 'nl')];
        expect(pickDefaultAudioTrack(noEnglish, 'de')).toBeUndefined();
    });

    it('returns undefined for an empty track list', () => {
        expect(pickDefaultAudioTrack([], 'en')).toBeUndefined();
    });
});

describe('pickDefaultSubtitleTrack', () => {
    const tracks: MediaTrack[] = [track('0', 'fr'), track('1', 'en'), track('2', 'nl')];

    it("returns null for 'off' regardless of what's available", () => {
        expect(pickDefaultSubtitleTrack(tracks, 'off')).toBeNull();
    });

    it('picks the first track matching the preferred language', () => {
        expect(pickDefaultSubtitleTrack(tracks, 'nl')).toBe(tracks[2]);
    });

    it('returns null (subtitles off) when nothing matches the preference — no further fallback', () => {
        expect(pickDefaultSubtitleTrack(tracks, 'de')).toBeNull();
    });

    it('returns null for an empty track list', () => {
        expect(pickDefaultSubtitleTrack([], 'en')).toBeNull();
    });
});
